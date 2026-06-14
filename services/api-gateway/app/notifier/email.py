"""Email notifier — supports two backends, chosen by env at boot.

Backend 1: SMTP (default for personal projects)
    NOTIFY_SMTP_HOST=smtp.qq.com
    NOTIFY_SMTP_PORT=465
    NOTIFY_SMTP_USER=xxx@qq.com
    NOTIFY_SMTP_PASS=<授权码, not 密码>
    NOTIFY_SMTP_SSL=true
    NOTIFY_FROM_NAME=什亭之匣 AI
    NOTIFY_FROM_EMAIL=xxx@qq.com
    NOTIFY_RETRY_MAX=3

Why SMTP still works for QQ/163/Gmail but not outlook.com:
    微软 2024-05 起对个人 outlook.com 禁了 SmtpClientAuthentication
    (basic auth)。QQ / 163 / Gmail SMTP basic auth 还活着。

Backend 2: Microsoft Graph API via OAuth2 (work/school tenants)
    NOTIFY_OAUTH_TENANT_ID=<azure-tenant-guid>
    NOTIFY_OAUTH_CLIENT_ID=<app-registration-client-id>
    NOTIFY_OAUTH_CLIENT_SECRET=<app-registration-client-secret>
    NOTIFY_FROM_USER=StudioArona301@outlook.com
    NOTIFY_FROM_NAME=什亭之匣 AI
    # 旧 SMTP env 保留作 fallback（要时再启用）
    # NOTIFY_SMTP_HOST=...

Required Azure setup (one-time, by tenant admin):
  1. https://entra.microsoft.com → App registrations → New
     Name: 什亭之匣 Notifier
     Account types: "Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)
                    and personal Microsoft accounts (e.g. Skype, Xbox)" ← 这条覆盖 outlook.com 个人账户
  2. Certificates & secrets → New client secret → copy value
  3. API permissions → Microsoft Graph → Application permissions → Mail.Send
     (注意: Application 权限需要 admin consent; 个人账户没有 admin 所以走 delegated
            的话需要 device code flow 拿 refresh_token — 见 _send_via_delegated)
  4. Grant admin consent for <tenant>

For PERSONAL outlook.com (no admin):
  Application permission Mail.Send 不行（个人租户不允许）。
  必须用 delegated Mail.Send + device code flow + refresh_token 持久化。
  Refresh token 存到 ~/.studioarona/oauth_token.json。

本模块两种模式:
  - client_credentials: 适用于工作/学校租户（有 admin）。
  - delegated device_code: 适用于 outlook.com 个人账户。

Public surface 与原 SMTP 版一致:
    from app.notifier.email import send_email, broadcast, scheduler
    await send_email(to, subject, body_text, html=..., tag=...)
    await broadcast(emails, subject, body_text, html=..., tag=...)
    scheduler.user_due(user, event)
    scheduler.admin_broadcast(subject, body, ...)
    scheduler.vm_error(error)
    scheduler.rss_update(items, user)
"""
from __future__ import annotations

import asyncio
import json
import os
import smtplib
import time
import webbrowser
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from typing import Any, Sequence

import aiosmtplib
import httpx
import structlog
from jinja2 import Environment, FileSystemLoader, select_autoescape

log = structlog.get_logger("notifier.email")


# ── Dead-letter log (NDJSON) ─────────────────────────────
_DLQ = Path.home() / ".studioarona" / "notifier_dlq.jsonl"
_DLQ.parent.mkdir(parents=True, exist_ok=True)

# ── Token cache (per-process) ─────────────────────────────
_TOKEN_FILE = Path.home() / ".studioarona" / "oauth_token.json"
_TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)

# ── Jinja2 templates ──────────────────────────────────────
_TPL_DIR = Path(__file__).parent / "templates"
_env_jinja = Environment(
    loader=FileSystemLoader(str(_TPL_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    enable_async=False,
)


# ── Backend selector ──────────────────────────────────────
def _backend() -> str:
    """'smtp' or 'graph'. SMTP wins if NOTIFY_SMTP_HOST is set."""
    if os.getenv("NOTIFY_SMTP_HOST"):
        return "smtp"
    if os.getenv("NOTIFY_OAUTH_CLIENT_ID"):
        return "graph"
    return "smtp"  # default fallback


def _smtp_cfg() -> dict[str, Any]:
    return {
        "host": os.getenv("NOTIFY_SMTP_HOST", ""),
        "port": int(os.getenv("NOTIFY_SMTP_PORT", "465")),
        "user": os.getenv("NOTIFY_SMTP_USER", ""),
        "pass": os.getenv("NOTIFY_SMTP_PASS", ""),
        "ssl": os.getenv("NOTIFY_SMTP_SSL", "true").lower() == "true",
        "from_name": os.getenv("NOTIFY_FROM_NAME", "什亭之匣 AI"),
        "from_email": os.getenv("NOTIFY_FROM_EMAIL",
                                  os.getenv("NOTIFY_SMTP_USER", "")),
        "retry_max": int(os.getenv("NOTIFY_RETRY_MAX", "3")),
    }


def _graph_cfg() -> dict[str, str]:
    return {
        "tenant_id": os.getenv("NOTIFY_OAUTH_TENANT_ID", "common"),
        "client_id": os.getenv("NOTIFY_OAUTH_CLIENT_ID", ""),
        "client_secret": os.getenv("NOTIFY_OAUTH_CLIENT_SECRET", ""),
        "from_user": os.getenv("NOTIFY_FROM_USER", "StudioArona301@outlook.com"),
        "from_name": os.getenv("NOTIFY_FROM_NAME", "什亭之匣 AI"),
        "graph_base": "https://graph.microsoft.com/v1.0",
    }


# Keep old single-config _cfg() for status endpoint compat
def _cfg() -> dict[str, str]:
    if _backend() == "smtp":
        s = _smtp_cfg()
        return {
            "host": s["host"], "port": s["port"], "user": s["user"],
            "pass": s["pass"], "starttls": not s["ssl"],
            "from_name": s["from_name"], "from_email": s["from_email"],
            "retry_max": s["retry_max"],
        }
    return _graph_cfg()


# ── Token management ──────────────────────────────────────
def _is_personal_outlook() -> bool:
    """Personal outlook.com accounts can't use client_credentials
    (no admin to grant Mail.Send application permission).
    They need delegated Mail.Send + device code / auth code flow."""
    tenant = _cfg()["tenant_id"].lower()
    user = _cfg()["from_user"].lower()
    return tenant in ("common", "consumers", "") or user.endswith("@outlook.com") \
        or user.endswith("@hotmail.com") or user.endswith("@live.com")


def _load_cached_token() -> dict | None:
    if not _TOKEN_FILE.exists():
        return None
    try:
        return json.loads(_TOKEN_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_token(tok: dict) -> None:
    """Cache token + refresh_token for delegated flow."""
    _TOKEN_FILE.write_text(json.dumps(tok, indent=2), encoding="utf-8")
    try:
        _TOKEN_FILE.chmod(0o600)
    except Exception:
        pass


# ── Client credentials (work/school tenants) ───────────
async def _token_client_credentials() -> str:
    cfg = _cfg()
    url = f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/token"
    data = {
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, data=data)
        if r.status_code != 200:
            raise RuntimeError(f"oauth_token_failed: {r.status_code} {r.text[:200]}")
        body = r.json()
        return body["access_token"]


# ── Device code (personal outlook.com) ──────────────────
async def _token_device_code() -> str:
    """Use device code flow once to bootstrap, then persist refresh_token."""
    cfg = _cfg()
    tenant = cfg["tenant_id"] or "consumers"

    # If we have a cached refresh_token, use it
    cached = _load_cached_token()
    if cached and cached.get("refresh_token"):
        try:
            return await _refresh(cached["refresh_token"])
        except Exception as exc:
            log.warning("notifier.refresh_failed_will_relogin", err=str(exc))

    # Otherwise: device code login
    dc_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/devicecode"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(dc_url, data={
            "client_id": cfg["client_id"],
            "scope": (
                "offline_access "
                "https://graph.microsoft.com/Mail.Send "
                "https://graph.microsoft.com/User.Read"
            ),
        })
        if r.status_code != 200:
            raise RuntimeError(f"device_code_request_failed: {r.status_code} {r.text[:200]}")
        dc = r.json()
        device_code = dc["device_code"]
        user_code = dc["user_code"]
        verify_url = dc["verification_uri"]
        interval = dc.get("interval", 5)
        expires_in = dc.get("expires_in", 900)

        log.info("notifier.device_code_login",
                 user_code=user_code, verify_url=verify_url)
        print(f"\n=== Outlook OAuth 登录 ===")
        print(f"打开: {verify_url}")
        print(f"输入代码: {user_code}\n")
        try:
            webbrowser.open(verify_url)
        except Exception:
            pass

        # Poll
        token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
        deadline = time.time() + expires_in
        while time.time() < deadline:
            await asyncio.sleep(interval)
            pr = await client.post(token_url, data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "client_id": cfg["client_id"],
                "device_code": device_code,
            })
            pb = pr.json()
            if pr.status_code == 200:
                _save_token(pb)
                return pb["access_token"]
            err = pb.get("error", "")
            if err == "authorization_pending":
                continue
            if err == "slow_down":
                interval += 5
                continue
            if err in ("expired_token", "access_denied", "invalid_grant"):
                raise RuntimeError(f"device_code_{err}: {pb.get('error_description','')}")
            raise RuntimeError(f"device_code_unknown: {pb}")

        raise RuntimeError("device_code_timeout")


async def _refresh(refresh_token: str) -> str:
    cfg = _cfg()
    tenant = cfg["tenant_id"] or "consumers"
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, data={
            "client_id": cfg["client_id"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": (
                "offline_access "
                "https://graph.microsoft.com/Mail.Send "
                "https://graph.microsoft.com/User.Read"
            ),
        })
        if r.status_code != 200:
            raise RuntimeError(f"refresh_failed: {r.status_code} {r.text[:200]}")
        body = r.json()
        # Microsoft ROTATES refresh_token — overwrite
        if body.get("refresh_token"):
            cached = _load_cached_token() or {}
            cached.update(body)
            _save_token(cached)
        return body["access_token"]


# ── Get access token (route by tenant type) ─────────────
_token_cache: dict[str, Any] = {"value": None, "expires_at": 0.0}


async def _get_access_token() -> str:
    """Returns a valid access token, using whichever flow matches the tenant."""
    if _token_cache["value"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["value"]

    cfg = _cfg()
    if not cfg["client_id"]:
        raise RuntimeError("NOTIFY_OAUTH_CLIENT_ID not set")

    if _is_personal_outlook():
        token = await _token_device_code()
    else:
        token = await _token_client_credentials()

    _token_cache["value"] = token
    _token_cache["expires_at"] = time.time() + 3500  # Graph tokens ~1h
    return token


# ── Send one email (router) ────────────────────────────
async def _send_one(
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None,
    *,
    tag: str = "generic",
    attempt: int = 0,
) -> bool:
    backend = _backend()
    if backend == "smtp":
        return await _send_one_smtp(to, subject, body_text, body_html, tag=tag)
    return await _send_one_graph(to, subject, body_text, body_html, tag=tag)


# ── Send one email via SMTP (QQ / 163 / Gmail) ─────────
async def _send_one_smtp(
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None,
    *,
    tag: str = "generic",
    attempt: int = 0,
) -> bool:
    cfg = _smtp_cfg()
    if not cfg["host"] or not cfg["user"] or not cfg["pass"]:
        log.error("notifier.smtp_not_configured", to=to)
        _dlq(to, subject, body_text, "smtp_not_configured")
        return False

    msg = EmailMessage()
    msg["From"] = formataddr((cfg["from_name"], cfg["from_email"]))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = datetime.now(UTC).strftime("%a, %d %b %Y %H:%M:%S +0000")
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    try:
        if cfg["ssl"]:
            # Port 465 — implicit SSL
            await aiosmtplib.send(
                msg,
                hostname=cfg["host"],
                port=cfg["port"],
                username=cfg["user"],
                password=cfg["pass"],
                use_tls=True,
                timeout=15,
            )
        else:
            # Port 587 — STARTTLS
            await aiosmtplib.send(
                msg,
                hostname=cfg["host"],
                port=cfg["port"],
                username=cfg["user"],
                password=cfg["pass"],
                start_tls=True,
                timeout=15,
            )
        log.info("notifier.sent", backend="smtp", to=to, subject=subject, tag=tag)
        return True
    except (smtplib.SMTPException, asyncio.TimeoutError, OSError) as exc:
        if attempt + 1 < cfg["retry_max"]:
            backoff = 2 ** attempt
            log.warning("notifier.smtp_retry", to=to, attempt=attempt,
                        err=str(exc), sleep=backoff)
            await asyncio.sleep(backoff)
            return await _send_one_smtp(to, subject, body_text, body_html,
                                        tag=tag, attempt=attempt + 1)
        err_msg = f"smtp_failed: {type(exc).__name__}: {exc}"
        log.error("notifier.failed", backend="smtp", to=to, subject=subject,
                  tag=tag, err=err_msg)
        _dlq(to, subject, body_text, err_msg)
        return False


# ── Send one email via Graph API ───────────────────────
async def _send_one_graph(
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None,
    *,
    tag: str = "generic",
) -> bool:
    cfg = _graph_cfg()
    if not cfg["client_id"]:
        log.error("notifier.no_oauth_config", to=to)
        _dlq(to, subject, body_text, "no_oauth_config")
        return False

    try:
        token = await _get_access_token()
    except Exception as exc:
        log.error("notifier.token_failed", to=to, err=str(exc))
        _dlq(to, subject, body_text, f"token_failed: {exc}")
        return False

    # Graph sendMail payload
    payload = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "HTML" if body_html else "Text",
                "content": body_html or body_text,
            },
            "toRecipients": [
                {"emailAddress": {"name": to.split("@")[0], "address": to}}
            ],
            "from": {
                "emailAddress": {
                    "name": cfg["from_name"],
                    "address": cfg["from_user"],
                }
            },
        },
        "saveToSentItems": False,
    }

    url = f"{cfg['graph_base']}/users/{cfg['from_user']}/sendMail"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(url, headers=headers, json=payload)
            if r.status_code == 202:
                log.info("notifier.sent", backend="graph", to=to, subject=subject, tag=tag)
                return True
            if r.status_code == 401:
                # Token expired / invalid — refresh and retry once
                log.warning("notifier.token_401_retry", to=to)
                _token_cache["value"] = None
                token = await _get_access_token()
                headers["Authorization"] = f"Bearer {token}"
                r = await client.post(url, headers=headers, json=payload)
                if r.status_code == 202:
                    log.info("notifier.sent_after_refresh", to=to, subject=subject, tag=tag)
                    return True
            err_msg = f"graph_send_failed: {r.status_code} {r.text[:300]}"
            log.error("notifier.failed", backend="graph", to=to, subject=subject,
                      tag=tag, err=err_msg)
            _dlq(to, subject, body_text, err_msg)
            return False
    except (httpx.HTTPError, asyncio.TimeoutError) as exc:
        err_msg = f"network_error: {type(exc).__name__}: {exc}"
        log.error("notifier.failed", backend="graph", to=to, subject=subject,
                  tag=tag, err=err_msg)
        _dlq(to, subject, body_text, err_msg)
        return False


def _dlq(to: str, subject: str, body: str, reason: str) -> None:
    rec = {
        "ts": datetime.now(UTC).isoformat(),
        "to": to, "subject": subject, "body": body[:400], "reason": reason,
    }
    with _DLQ.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


# ── Public surface ───────────────────────────────────────
async def send_email(
    to: str,
    subject: str,
    body: str,
    *,
    html: str | None = None,
    tag: str = "generic",
) -> bool:
    """Send one email via whichever backend is configured (SMTP or Graph)."""
    return await _send_one(to, subject, body, html, tag=tag)


async def broadcast(
    recipients: Sequence[str | None],
    subject: str,
    body: str,
    *,
    html: str | None = None,
    tag: str = "broadcast",
    concurrency: int = 5,
) -> dict[str, int]:
    sem = asyncio.Semaphore(concurrency)
    results: dict[str, int] = {"ok": 0, "failed": 0, "skipped": 0}

    async def _one(addr: str | None) -> None:
        async with sem:
            if not addr:
                results["skipped"] += 1
                return
            ok = await send_email(addr, subject, body, html=html, tag=tag)
            results["ok" if ok else "failed"] += 1

    await asyncio.gather(*[_one(a) for a in recipients])
    log.info("notifier.broadcast", **results, subject=subject, tag=tag)
    return results


# ── Templates (Jinja2) ───────────────────────────────────
def _render(name: str, **ctx: Any) -> str:
    if not (_TPL_DIR / name).exists():
        return ""
    try:
        return _env_jinja.get_template(name).render(**ctx)
    except Exception as exc:
        log.warning("notifier.tpl_error", name=name, err=str(exc))
        return ""


def render_html(template: str, **ctx: Any) -> str:
    return _render(f"{template}.html.j2", **ctx)


def render_text(template: str, **ctx: Any) -> str:
    return _render(f"{template}.txt.j2", **ctx) or _render(f"{template}.html.j2", **ctx) or ""


# ── Trigger Hooks (4 scenarios) ─────────────────────────
class _TriggerScheduler:
    """Hooks called by the rest of the app. Stay decoupled."""

    def __init__(self) -> None:
        self._resolver = None

    def set_resolver(self, fn) -> None:
        self._resolver = fn

    async def _all_users(self) -> list[tuple[str, str, str, str]]:
        if not self._resolver:
            return []
        return await self._resolver()

    async def _admins(self) -> list[tuple[str, str, str, str]]:
        return [u for u in await self._all_users() if u[3] == "admin"]

    # 1. user schedule due
    async def user_due(self, user: dict, event: dict) -> None:
        if not user.get("email"):
            log.info("notifier.skip.no_email", user_id=user.get("id"))
            return
        subj = f"⏰ 日程提醒：{event.get('title', '未命名')}"
        ctx = {"user": user, "event": event, "starts_at": event.get("starts_at")}
        body_text = render_text("schedule_due", **ctx) or f"{event.get('title')}\n{event.get('body','')}"
        body_html = render_html("schedule_due", **ctx) or None
        await send_email(user["email"], subj, body_text, html=body_html, tag="schedule_due")

    # 2. admin broadcast
    async def admin_broadcast(self, subject: str, body: str, *,
                              html: str | None = None,
                              from_admin_id: str | None = None) -> dict[str, int]:
        users = await self._all_users()
        recipients = [u[1] for u in users]
        return await broadcast(recipients, subject, body, html=html, tag="admin_broadcast")

    # 3. vm error
    async def vm_error(self, error: dict) -> None:
        admins = await self._admins()
        if not admins:
            log.warning("notifier.no_admins_to_warn", error=error)
            return
        subj = f"🚨 容器告警：{error.get('service', 'unknown')}"
        ctx = {
            "service": error.get("service"),
            "message": error.get("message"),
            "traceback": error.get("traceback", ""),
            "ts": datetime.now(UTC).isoformat(),
        }
        body_text = render_text("vm_error", **ctx) or \
            f"[{ctx['service']}] {ctx['message']}\n\n{ctx['traceback']}"
        body_html = render_html("vm_error", **ctx) or None
        for _uid, email, _name, _role in admins:
            await send_email(email, subj, body_text, html=body_html, tag="vm_error")

    # 4. rss update
    async def rss_update(self, items: list[dict], user: dict) -> None:
        if not user.get("email") or not items:
            return
        subj = f"📰 RSS 更新：{len(items)} 条新内容"
        ctx = {"user": user, "items": items[:20]}
        body_text = render_text("rss_update", **ctx) or \
            "\n".join(f"- {it.get('title')} ({it.get('link')})" for it in items[:20])
        body_html = render_html("rss_update", **ctx) or None
        await send_email(user["email"], subj, body_text, html=body_html, tag="rss_update")


scheduler = _TriggerScheduler()


# ── Health / status helpers (used by /api/admin/notify/status) ───
def channel_status() -> dict[str, Any]:
    """Returns the active notifier backend + relevant config (no secrets leaked)."""
    backend = _backend()
    if backend == "smtp":
        s = _smtp_cfg()
        return {
            "backend": "smtp",
            "host": s["host"],
            "port": s["port"],
            "user": s["user"],
            "pass_set": bool(s["pass"]),
            "ssl": s["ssl"],
            "from_name": s["from_name"],
            "from_email": s["from_email"],
            "retry_max": s["retry_max"],
        }
    # graph
    g = _graph_cfg()
    cached = _load_cached_token()
    return {
        "backend": "graph",
        "mode": "device_code" if _is_personal_outlook() else "client_credentials",
        "tenant_id": g["tenant_id"] or "consumers",
        "client_id_set": bool(g["client_id"]),
        "client_secret_set": bool(g["client_secret"]),
        "from_user": g["from_user"],
        "from_name": g["from_name"],
        "token_cached": bool(cached and cached.get("access_token")),
        "token_expires_at": cached.get("expires_on") if cached else None,
        "is_personal_outlook": _is_personal_outlook(),
    }
