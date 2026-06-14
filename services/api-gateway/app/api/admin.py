"""Admin dashboard endpoints: user list with online status + system resource usage.

Requires admin role (Depends(require_admin)).

Online status: a user is "online" if their per-user Hermes daemon (LLM Gateway
UserSessionManager) is currently alive. We ask the local LLM Gateway at
LLM_GATEWAY_SERVICE_URL for the active session list, then match by user id.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import time
from typing import Any

import httpx
import psutil
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.db.session import get_db
from app.models.user import User
from app.notifier.email import scheduler as notifier
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin", tags=["Admin"])

LLM_GATEWAY_URL = os.environ.get("LLM_GATEWAY_SERVICE_URL", "http://127.0.0.1:8645")


def _process_tree_rss(pid: int) -> int:
    """Sum RSS (resident set size, bytes) of pid + all descendants.

    Returns 0 if process doesn't exist or no permission.
    """
    total = 0
    try:
        parent = psutil.Process(pid)
        total += parent.memory_info().rss
        for child in parent.children(recursive=True):
            try:
                total += child.memory_info().rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return 0
    return total


def _disk_for_path(path: str) -> psutil._common.sdiskusage:
    return psutil.disk_usage(path)


@router.get("/system")
async def system_resources(_admin: User = Depends(require_admin)) -> dict[str, Any]:
    """CPU, memory, disk, network + top processes by RSS."""
    # CPU — interval=None gives non-blocking reading since last call
    cpu_percent = psutil.cpu_percent(interval=0.3)
    cpu_count = psutil.cpu_count(logical=True) or 1
    # Memory
    vm = psutil.virtual_memory()
    # Disk — project root
    root_path = os.environ.get("STUDIOARONA_ROOT", "/Users/zhangxuanning/StudioArona")
    disk = psutil.disk_usage(root_path)
    # Network (delta since last call; cumulative counters are fine for overview)
    net = psutil.net_io_counters()
    # Top 5 processes by RSS
    procs = []
    for p in psutil.process_iter(["pid", "name", "memory_info", "username"]):
        try:
            mem = p.info.get("memory_info")
            if mem is None:
                continue
            procs.append({
                "pid": p.info["pid"],
                "name": p.info.get("name") or "?",
                "username": p.info.get("username") or "?",
                "rss": mem.rss,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x["rss"], reverse=True)
    return {
        "cpu": {
            "percent": cpu_percent,
            "count": cpu_count,
            "load_avg": list(psutil.getloadavg()) if hasattr(psutil, "getloadavg") else None,
        },
        "memory": {
            "total": vm.total,
            "available": vm.available,
            "used": vm.used,
            "percent": vm.percent,
        },
        "disk": {
            "path": root_path,
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "percent": disk.percent,
        },
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
        },
        "top_processes": procs[:10],
        "boot_time": psutil.boot_time(),
    }


@router.get("/users")
async def admin_list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """All users + online status (matches LLM Gateway active sessions)."""
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()

    # 拉 LLM Gateway 活跃 sessions
    online_user_ids: set[str] = set()
    user_sessions: dict[str, dict[str, Any]] = {}
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{LLM_GATEWAY_URL}/internal/active-sessions")
            if r.status_code == 200:
                data = r.json()
                for s in data.get("sessions", []):
                    uid = s.get("user_id")
                    pid = s.get("pid")
                    if not uid or not pid:
                        continue
                    # Check if process is actually alive (LLM Gateway may have
                    # stale entries for dead/zombie daemons)
                    if not psutil.pid_exists(pid):
                        continue
                    try:
                        p = psutil.Process(pid)
                        if p.status() == psutil.STATUS_ZOMBIE:
                            continue
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                    online_user_ids.add(uid)
                    user_sessions[uid] = s
    except Exception:
        pass  # 离线降级 — 全员视为离线

    out: list[dict[str, Any]] = []
    for u in users:
        sess = user_sessions.get(u.id)
        rss = _process_tree_rss(sess["pid"]) if sess and sess.get("pid") else 0
        out.append({
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "role": u.role,
            "created_at": u.created_at.isoformat(),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "online": u.id in online_user_ids,
            "hermes_pid": sess.get("pid") if sess else None,
            "hermes_last_active": sess.get("last_active") if sess else None,
            "hermes_rss_bytes": rss,
        })
    return out


@router.get("/weather-fetcher")
async def weather_fetcher_status(_admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Weather fetcher daemon liveness + cache freshness."""
    import json
    cache = Path(os.environ.get("STUDIOARONA_HOME", str(Path.home() / ".studioarona"))) / "weather_cache.json"
    if not cache.exists():
        return {"running": False, "cache_exists": False}
    try:
        data = json.loads(cache.read_text(encoding="utf-8"))
        age = time.time() - float(data.get("updated_at", 0))
        return {
            "running": True,
            "cache_exists": True,
            "cache_age_seconds": age,
            "cache_fresh": age < 360,
            "cities": list(data.get("cities", {}).keys()),
            "updated_at": data.get("updated_at"),
        }
    except Exception as e:
        return {"running": True, "cache_exists": True, "parse_error": str(e)}


@router.post("/users/{user_id}/kill-session")
async def kill_user_session(
    user_id: str,
    _admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Force-kill a user's Hermes daemon. Next request will re-spawn."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.post(
                f"{LLM_GATEWAY_URL}/v1/users/{user_id}/sessions/refresh",
                # The endpoint as written doesn't accept a kill flag — we send a
                # special header that LLM Gateway looks for.
                headers={"X-Force-Kill": "1"},
            )
            return {"ok": r.status_code == 200, "status": r.status_code, "body": r.text[:200]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# Local import for Path (avoids module-level pollution)
from pathlib import Path


# ── Notifier endpoints (admin only) ──────────────────
class _TestSendRequest(BaseModel):
    to: str
    subject: str = "🧪 什亭之匣 AI · 测试邮件"
    body: str = "这是一封来自什亭之匣 AI 的测试邮件 — SMTP 通道正常 ✅"


class _BroadcastRequest(BaseModel):
    subject: str
    body: str
    html: str | None = None


@router.post("/notify/test")
async def notify_test(
    body: _TestSendRequest,
    _admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Admin: send a test email to a single address. Verifies SMTP config."""
    from app.notifier.email import send_email, render_html
    html = render_html("admin_broadcast", subject=body.subject, body=body.body)
    ok = await send_email(body.to, body.subject, body.body, html=html, tag="admin_test")
    return {"ok": ok, "to": body.to}


@router.post("/notify/broadcast")
async def notify_broadcast(
    body: _BroadcastRequest,
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Admin: broadcast a notice to ALL users with an email on file."""
    from app.notifier.email import render_html
    html = body.html or render_html("admin_broadcast",
                                    subject=body.subject, body=body.body)
    result = await notifier.admin_broadcast(
        body.subject, body.body, html=html, from_admin_id=admin.id,
    )
    return {"subject": body.subject, **result}


@router.post("/notify/user/{user_id}")
async def notify_user(
    user_id: str,
    body: _BroadcastRequest,
    _admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Admin: send a notice to a single user by id."""
    from app.notifier.email import send_email, render_html
    from app.db.session import async_session_factory
    async with async_session_factory() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not u:
            return {"ok": False, "error": "user_not_found"}
        if not u.email:
            return {"ok": False, "error": "user_has_no_email"}
        html = body.html or render_html("admin_broadcast",
                                        subject=body.subject, body=body.body)
        ok = await send_email(u.email, body.subject, body.body,
                              html=html, tag="admin_targeted")
        return {"ok": ok, "to": u.email, "subject": body.subject}


@router.get("/notify/dlq")
async def notify_dlq(
    limit: int = 50,
    _admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Read the dead-letter queue (failed sends)."""
    from app.notifier.email import _DLQ
    if not _DLQ.exists():
        return {"count": 0, "items": []}
    lines = _DLQ.read_text(encoding="utf-8").strip().splitlines()[-limit:]
    import json
    items = []
    for ln in lines:
        try:
            items.append(json.loads(ln))
        except Exception:
            continue
    return {"count": len(items), "items": items}


@router.get("/notify/status")
async def notify_status(_admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Show OAuth/Graph config status (without leaking secrets)."""
    from app.notifier.email import channel_status
    return channel_status()
