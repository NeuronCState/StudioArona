"""LLM Gateway — OpenAI-compatible HTTP endpoint that fronts the MiniMax API.

Port 8645 (Hermes proxy default) in the StudioArona stack.
Adds per-user session management: a Hermes daemon is spawned per
active user (HERMES_PROFILE=<user_id>) so each user has isolated
USER.md / MEMORY.md / skills / cron jobs.

Behavior:
  * Accepts OpenAI-protocol chat completion requests (with SSE streaming).
  * Forwards them to the MiniMax (MiniMax) API using the CN endpoint.
  * Strips <think>...</think> reasoning blocks.
  * Injects per-user context (USER.md, MEMORY.md, recent skills) into
    the system prompt when X-User-Id header is provided.
  * Spawns a per-user Hermes daemon on first contact and keeps it
    warm for 30 minutes of idle time.
  * Cleans up all user daemons when the gateway shuts down.

Run with:  python -m services.llm_gateway.main
or via:     ./run.sh start  (managed by start.py)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

DEFAULT_UPSTREAM_BASE = "https://api.minimaxi.com/v1"
DEFAULT_PORT = 8645  # Hermes proxy default port
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # services/llm_gateway/main.py → project root
DEFAULT_MODEL = "MiniMax-M2.5-highspeed"
IDLE_TIMEOUT_SECONDS = 30 * 60  # 30 minutes
IDLE_CHECK_INTERVAL_SECONDS = 60
USER_ACTIVITY_WINDOW_DAYS = 15  # pre-warm users active in last 15 days
THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL)
THINK_OPEN = re.compile(r"<think>", re.DOTALL)
THINK_CLOSE = re.compile(r"</think>", re.DOTALL)

logger = logging.getLogger("llm_gateway")
logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")


# ─── Config helpers ──────────────────────────────────────────────────


def get_upstream() -> str:
    return os.environ.get("MINIMAX_CN_BASE_URL", DEFAULT_UPSTREAM_BASE).rstrip("/")


def get_api_key() -> str:
    return (
        os.environ.get("MINIMAX_CN_API_KEY")
        or os.environ.get("MINIMAX_API_KEY")
        or ""
    )


def get_default_model() -> str:
    return os.environ.get("LLM_GATEWAY_DEFAULT_MODEL", DEFAULT_MODEL)


def get_hermes_home() -> Path:
    """Base Hermes home directory (parent of all profiles)."""
    return Path(os.environ.get("HERMES_BASE_HOME", Path.home() / ".hermes")).expanduser()


def get_profile_dir(user_id: str) -> Path:
    """Per-user Hermes profile directory: ~/.hermes/profiles/<user_id>/"""
    safe = re.sub(r"[^A-Za-z0-9_.\-]", "_", user_id)[:64]
    return get_hermes_home() / "profiles" / safe


def get_idle_timeout() -> int:
    return int(os.environ.get("LLM_GATEWAY_IDLE_TIMEOUT", str(IDLE_TIMEOUT_SECONDS)))


def load_env_file() -> None:
    """Best-effort loader for the project's .env.local."""
    env_path = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ─── Thinking filter ────────────────────────────────────────────────


def strip_think(text: str, *, in_think: bool) -> tuple[str, bool]:
    if in_think:
        end = THINK_CLOSE.search(text)
        if end is None:
            return "", True
        text = text[end.end():]
        in_think = False
    while True:
        m = THINK_OPEN.search(text)
        if m is None:
            break
        end = THINK_CLOSE.search(text, m.end())
        if end is None:
            return text[: m.start()], True
        text = text[: m.start()] + text[end.end():]
    return text, in_think


# ─── User session manager ────────────────────────────────────────────


@dataclass
class UserSession:
    user_id: str
    pid: Optional[int] = None
    last_active: float = field(default_factory=time.time)
    profile_dir: Optional[Path] = None
    spawned_at: float = field(default_factory=time.time)


class UserSessionManager:
    """Manages one Hermes daemon per active user.

    Lifecycle:
      * spawn(user_id) — start a per-profile Hermes if not running; refresh last_active
      * touch(user_id) — refresh last_active without spawning if already running
      * cleanup_idle() — kill daemons idle longer than idle_timeout
      * kill_all() — kill every daemon (used on gateway shutdown)

    Idle reclamation runs every IDLE_CHECK_INTERVAL_SECONDS via the
    FastAPI lifespan background task.
    """

    def __init__(self) -> None:
        self.sessions: Dict[str, UserSession] = {}
        self._lock = asyncio.Lock()
        self._idle_task: Optional[asyncio.Task] = None
        self._shutdown = False

    def register_shutdown_callback(self) -> None:
        """Register SIGINT/SIGTERM handler so all daemons are killed
        when the gateway itself is killed (e.g. via run.sh Ctrl+C)."""
        def _handler(signum, frame):
            logger.info("signal %s received — killing all user Hermes daemons", signum)
            self.kill_all()
            raise SystemExit(0)
        try:
            signal.signal(signal.SIGINT, _handler)
            signal.signal(signal.SIGTERM, _handler)
        except (ValueError, OSError):
            # In some environments (e.g. non-main thread) signal handlers can't be set.
            pass

    async def warmup_from_user_history(self) -> None:
        """Eager-start daemons for users with last_login_at within
        USER_ACTIVITY_WINDOW_DAYS. Reads from the project's PostgreSQL
        users table via raw SQL (avoids importing api-gateway which has
        a hyphen in its package name and can't be imported normally)."""
        from sqlalchemy import create_engine, text

        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            logger.info("warmup skipped: DATABASE_URL not set in env")
            return
        # Convert asyncpg URL to sync psycopg2-style for plain text()
        sync_url = db_url.replace("+asyncpg", "").replace("+psycopg2", "")
        try:
            engine = create_engine(sync_url, future=True)
        except Exception as e:
            logger.warning("warmup: could not create engine (%s)", e)
            return
        cutoff = datetime.utcnow() - timedelta(days=USER_ACTIVITY_WINDOW_DAYS)
        try:
            with engine.connect() as conn:
                rows = conn.execute(
                    text("SELECT id, last_login_at FROM users WHERE last_login_at >= :cutoff"),
                    {"cutoff": cutoff},
                ).all()
        except Exception as e:
            logger.warning("warmup: DB query failed (%s); skipping", e)
            return

        for row in rows:
            user_id = str(row[0])
            logger.info("warmup: spawning Hermes for user %s (last_login_at=%s)", user_id, row[1])
            await self.spawn(user_id)

    async def spawn(self, user_id: str) -> None:
        async with self._lock:
            sess = self.sessions.get(user_id)
            if sess is not None and self._is_alive(sess):
                sess.last_active = time.time()
                return
            if sess is None:
                sess = UserSession(user_id=user_id)
                self.sessions[user_id] = sess
            sess.profile_dir = get_profile_dir(user_id)
            sess.profile_dir.mkdir(parents=True, exist_ok=True)
            # Ensure default USER.md / MEMORY.md exist so Hermes finds them
            (sess.profile_dir / "USER.md").touch()
            (sess.profile_dir / "MEMORY.md").touch()

            env = os.environ.copy()
            env["HERMES_HOME"] = str(sess.profile_dir)
            env["MINIMAX_CN_API_KEY"] = get_api_key()
            env["MINIMAX_CN_BASE_URL"] = get_upstream()
            log_path = sess.profile_dir / "hermes.log"
            try:
                popen_kwargs: dict = dict(
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=open(log_path, "ab"),
                    stderr=subprocess.STDOUT,
                )
                if sys.platform == "win32":
                    popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
                else:
                    popen_kwargs["start_new_session"] = True
                proc = subprocess.Popen(
                    ["hermes", "gateway", "run", "--no-supervise", "--replace"],
                    **popen_kwargs,
                )
            except FileNotFoundError:
                logger.error("hermes CLI not found in PATH; user %s daemon not started", user_id)
                del self.sessions[user_id]
                return
            sess.pid = proc.pid
            sess.last_active = time.time()
            sess.spawned_at = time.time()
            logger.info("spawned Hermes daemon for user %s (pid=%s, profile=%s)",
                        user_id, proc.pid, sess.profile_dir)

    async def touch(self, user_id: str) -> None:
        """Mark user as active. Spawn if not running (lazy start)."""
        await self.spawn(user_id)

    def _is_alive(self, sess: UserSession) -> bool:
        """Check whether the per-user Hermes process is actually running.

        os.kill(pid, 0) on macOS reports success for zombie processes, so
        we additionally verify the process status via psutil."""
        if sess.pid is None:
            return False
        try:
            os.kill(sess.pid, 0)
        except (ProcessLookupError, PermissionError):
            return False
        try:
            import psutil
            p = psutil.Process(sess.pid)
            if p.status() == psutil.STATUS_ZOMBIE:
                return False
        except (ImportError, Exception):
            # psutil not available or process already gone — fall through.
            # The os.kill check above is our best signal in that case.
            pass
        return True

    def _kill(self, sess: UserSession, *, grace_seconds: float = 3.0) -> None:
        """Kill a per-user Hermes daemon. SIGTERM first, SIGKILL after grace."""
        if sess.pid is None:
            return
        if sys.platform == "win32":
            # Windows: no os.killpg/signal.SIGKILL — use taskkill
            try:
                subprocess.run(
                    ["taskkill", "/PID", str(sess.pid), "/T"],
                    check=False, capture_output=True, timeout=5,
                )
            except Exception:
                pass
            deadline = time.time() + grace_seconds
            while time.time() < deadline:
                try:
                    os.kill(sess.pid, 0)
                    time.sleep(0.2)
                except (ProcessLookupError, OSError):
                    logger.info(
                        "killed Hermes daemon pid=%s for user %s (taskkill)",
                        sess.pid, sess.user_id,
                    )
                    return
            try:
                subprocess.run(
                    ["taskkill", "/F", "/PID", str(sess.pid), "/T"],
                    check=False, capture_output=True, timeout=5,
                )
                logger.info(
                    "killed Hermes daemon pid=%s for user %s "
                    "(taskkill /F after %.1fs grace)",
                    sess.pid, sess.user_id, grace_seconds,
                )
            except Exception:
                pass
            return
        # POSIX: os.killpg + signal.SIGTERM / SIGKILL
        try:
            pgid = os.getpgid(sess.pid)
        except (ProcessLookupError, OSError):
            return
        try:
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError) as e:
            logger.debug("SIGTERM failed for pid=%s user=%s: %s", sess.pid, sess.user_id, e)
            return
        deadline = time.time() + grace_seconds
        while time.time() < deadline:
            try:
                os.kill(sess.pid, 0)
                time.sleep(0.2)
            except ProcessLookupError:
                logger.info(
                    "killed Hermes daemon pid=%s for user %s (SIGTERM)",
                    sess.pid, sess.user_id,
                )
                return
        try:
            os.killpg(pgid, signal.SIGKILL)
            logger.info(
                "killed Hermes daemon pid=%s for user %s "
                "(SIGKILL after %.1fs grace)",
                sess.pid, sess.user_id, grace_seconds,
            )
        except (ProcessLookupError, PermissionError, OSError) as e:
            logger.debug("SIGKILL failed for pid=%s user=%s: %s", sess.pid, sess.user_id, e)

    def cleanup_idle_sync(self) -> int:
        """Synchronous version of cleanup_idle (for tests or manual calls)."""
        now = time.time()
        timeout = get_idle_timeout()
        killed = 0
        for uid in list(self.sessions.keys()):
            sess = self.sessions[uid]
            if now - sess.last_active > timeout:
                self._kill(sess)
                del self.sessions[uid]
                killed += 1
        return killed

    async def idle_loop(self) -> None:
        """Background coroutine: every IDLE_CHECK_INTERVAL_SECONDS, kill daemons
        that have been idle longer than idle_timeout."""
        while not self._shutdown:
            try:
                killed = self.cleanup_idle_sync()
                if killed:
                    logger.info("idle cleanup: killed %d daemons", killed)
            except Exception as e:
                logger.warning("idle loop error: %s", e)
            await asyncio.sleep(IDLE_CHECK_INTERVAL_SECONDS)

    def kill_all(self) -> None:
        """Synchronous kill-all (for shutdown hook and SIGINT handler)."""
        for uid, sess in list(self.sessions.items()):
            self._kill(sess)
        self.sessions.clear()
        self._shutdown = True


from datetime import datetime, timedelta  # used by warmup_from_user_history


# ─── Per-user context injection ─────────────────────────────────────


async def _fetch_runtime_context() -> Dict[str, Any]:
    """Best-effort fetch of dynamic user context (temperature, schedules,
    VMs, weather, hardware). Each source is independent with a 1s timeout;
    failures are silently skipped so the chat path never blocks.

    This is the "走 hermes" surface: even though the LLM call goes
    directly to minimax, every chat request gets the same per-user
    runtime picture that Hermes would assemble from its plugins.
    """
    import asyncio

    async def _safe_get(name: str, url: str, timeout: float = 1.0) -> Optional[Any]:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    return r.json()
        except Exception as e:
            logger.debug("runtime context %s fetch failed: %s", name, e)
        return None

    api_gw = os.environ.get("API_GATEWAY_URL", "http://127.0.0.1:8080")
    perception = os.environ.get("PERCEPTION_URL", "http://127.0.0.1:8002")

    tasks = {
        "schedules": _safe_get("schedules", f"{api_gw}/api/schedules/upcoming"),
        "vms": _safe_get("vms", f"{api_gw}/api/vms"),
        "weather": _safe_get("weather", f"{perception}/api/weather"),
        "hardware": _safe_get("hardware", f"{perception}/api/hardware/status"),
    }
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return dict(zip(tasks.keys(), results))


def _read_cpu_temp_macos() -> Optional[str]:
    """Try multiple strategies to read macOS CPU temperature."""
    import subprocess
    # 1) osx-cpu-temp (brew formula, if installed)
    if shutil.which("osx-cpu-temp"):
        try:
            r = subprocess.run(["osx-cpu-temp"], capture_output=True, text=True, timeout=2)
            if r.returncode == 0:
                return f"{r.stdout.strip()}°C (osx-cpu-temp)"
        except Exception:
            pass
    # 2) Parse `powermetrics` (needs sudo, skip silently)
    # 3) Try IOKit via PyObjC if installed
    try:
        import objc  # type: ignore
        from Foundation import NSBundle  # type: ignore
        # Very basic SMC probe — works without sudo on many Macs
        smc = NSBundle.bundleWithPath_("/System/Library/Frameworks/IOKit.framework")
        if smc is None:
            return None
        # Skip the full SMC bind — too heavy. Just report "unavailable" hint.
    except ImportError:
        pass
    return None


def read_user_context(user_id: str, runtime: Optional[Dict[str, Any]] = None,
                      max_chars: int = 8000) -> Optional[str]:
    """Read USER.md + MEMORY.md for the user and combine with runtime
    context (temperature, schedules, VMs, weather, hardware, current time).

    Returns a system-prompt-friendly string, or None if the user has
    no profile and no runtime data.
    """
    profile = get_profile_dir(user_id)
    parts: List[str] = []

    # Static (Hermes-managed) context
    if profile.exists():
        for filename, label in (("USER.md", "用户画像"), ("MEMORY.md", "长期记忆")):
            p = profile / filename
            if p.exists():
                content = p.read_text().strip()
                if content:
                    parts.append(f"### {label}\n{content[:max_chars]}")

    # Dynamic runtime context
    runtime_lines: List[str] = []
    now = datetime.now()
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    runtime_lines.append(f"**当前时间**: {now.strftime('%Y-%m-%d')} {weekdays[now.weekday()]} {now.strftime('%H:%M:%S')}")

    # CPU temperature (macOS only)
    if sys.platform == "darwin":
        temp = _read_cpu_temp_macos()
        runtime_lines.append(f"**CPU 温度**: {temp if temp else 'unavailable (需要 osx-cpu-temp)'}")

    # Runtime data from API/Perception
    if runtime:
        for key, data in runtime.items():
            if not data:
                continue
            label_map = {
                "schedules": "📅 即将到来的日程",
                "vms": "🖥️ 虚拟机状态",
                "weather": "🌤 天气",
                "hardware": "⚙️ 硬件状态",
            }
            runtime_lines.append(f"**{label_map.get(key, key)}**: {json.dumps(data, ensure_ascii=False)[:500]}")

    parts.append("### 实时环境\n" + "\n".join(runtime_lines))

    if not profile.exists() and not any(runtime.values() if runtime else []):
        return None
    return f"[Hermes 用户专属上下文 — {user_id}]\n\n" + "\n\n".join(parts)


def read_user_skills(user_id: str) -> List[Dict[str, Any]]:
    """List all SKILL.md files in the user's profile, classifying them as
    user-provided vs Hermes-generated (heuristic based on path/name)."""
    profile = get_profile_dir(user_id)
    skills_dir = profile / "skills"
    if not skills_dir.exists():
        return []
    out: List[Dict[str, Any]] = []
    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue
        content = skill_md.read_text(encoding="utf-8", errors="ignore")
        first_line = content.splitlines()[0] if content else ""
        name = first_line.lstrip("# ").strip() or skill_dir.name
        # Heuristic: Hermes-generated skills typically live in a "generated" subdir
        # or have a "created-by-hermes" marker in the frontmatter.
        origin = "user"
        if "generated" in str(skill_dir).lower() or "hermes" in content[:200].lower():
            origin = "hermes"
        out.append({
            "name": name,
            "slug": skill_dir.name,
            "origin": origin,
            "path": str(skill_md.relative_to(get_hermes_home())) if skill_dir.name else "",
            "preview": content[:200],
        })
    return out


# ─── LLM streaming ───────────────────────────────────────────────────


async def stream_from_upstream(
    payload: Dict[str, Any],
) -> AsyncIterator[bytes]:
    upstream = get_upstream()
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="MINIMAX_API_KEY not set")
    payload = {**payload}
    payload.setdefault("model", get_default_model())
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    in_think = False
    url = f"{upstream}/chat/completions"
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise HTTPException(status_code=resp.status_code,
                                    detail=body.decode("utf-8", "ignore"))
            async for raw in resp.aiter_lines():
                if not raw or not raw.startswith("data:"):
                    yield (raw + "\n\n").encode()
                    continue
                data = raw[5:].strip()
                if data == "[DONE]":
                    yield b"data: [DONE]\n\n"
                    return
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    yield (raw + "\n\n").encode()
                    continue
                for choice in obj.get("choices", []):
                    delta = choice.get("delta") or {}
                    if "content" in delta and delta["content"]:
                        cleaned, in_think = strip_think(delta["content"], in_think=in_think)
                        delta["content"] = cleaned
                    if "reasoning_content" in delta:
                        delta.pop("reasoning_content", None)
                yield ("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode()


# ─── FastAPI app ─────────────────────────────────────────────────────

app = FastAPI(title="StudioArona LLM Gateway", version="2.0.0")
sessions = UserSessionManager()


@app.on_event("startup")
async def _on_startup() -> None:
    load_env_file()
    sessions.register_shutdown_callback()
    # Start idle-reclamation loop
    sessions._idle_task = asyncio.create_task(sessions.idle_loop())
    # Eager-warm Hermes daemons for recently active users
    await sessions.warmup_from_user_history()
    logger.info("gateway ready on default model=%s upstream=%s idle_timeout=%ss",
                get_default_model(), get_upstream(), get_idle_timeout())


@app.on_event("shutdown")
async def _on_shutdown() -> None:
    sessions._shutdown = True
    if sessions._idle_task:
        sessions._idle_task.cancel()
    sessions.kill_all()
    logger.info("gateway shutting down — all user Hermes daemons killed")


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "upstream": get_upstream(),
        "default_model": get_default_model(),
        "api_key_configured": bool(get_api_key()),
        "idle_timeout_s": int(os.environ.get("LLM_GATEWAY_IDLE_TIMEOUT", str(IDLE_TIMEOUT_SECONDS))),
        "active_sessions": list(sessions.sessions.keys()),
    }


@app.get("/internal/active-sessions")
async def active_sessions() -> Dict[str, Any]:
    """List per-user Hermes daemon sessions — for the admin dashboard."""
    out = []
    for uid, sess in sessions.sessions.items():
        out.append({
            "user_id": uid,
            "pid": sess.pid,
            "last_active": sess.last_active,
            "started_at": sess.spawned_at,
        })
    return {"sessions": out, "count": len(out)}


@app.get("/v1/models")
async def list_models() -> Dict[str, Any]:
    models = [
        "MiniMax-M3",
        "MiniMax-M2.7",
        "MiniMax-M2.7-highspeed",
        "MiniMax-M2.5",
        "MiniMax-M2.5-highspeed",
        "MiniMax-M2.1",
        "MiniMax-M2.1-highspeed",
        "MiniMax-M2",
    ]
    return {
        "object": "list",
        "data": [{"id": m, "object": "model", "owned_by": "MiniMax"} for m in models],
    }


@app.get("/v1/users/{user_id}/skills")
async def list_user_skills(user_id: str) -> Dict[str, Any]:
    """List skills available for a user: user-provided + Hermes-generated."""
    skills = read_user_skills(user_id)
    return {
        "user_id": user_id,
        "total": len(skills),
        "user_provided": [s for s in skills if s["origin"] == "user"],
        "hermes_generated": [s for s in skills if s["origin"] == "hermes"],
    }


@app.get("/v1/users/{user_id}/memory")
async def read_user_memory(user_id: str) -> Dict[str, Any]:
    """Inspect the per-user memory and identity files."""
    profile = get_profile_dir(user_id)
    if not profile.exists():
        raise HTTPException(status_code=404, detail=f"profile {user_id} not found")
    user_md = (profile / "USER.md").read_text() if (profile / "USER.md").exists() else ""
    memory_md = (profile / "MEMORY.md").read_text() if (profile / "MEMORY.md").exists() else ""
    return {
        "user_id": user_id,
        "profile_dir": str(profile),
        "user_md": user_md,
        "memory_md": memory_md,
    }


@app.post("/v1/users/{user_id}/sessions/refresh")
async def refresh_user_session(user_id: str, request: Request) -> Dict[str, Any]:
    """Force-touch a user session — used when the frontend learns the user
    is active again (e.g. WebSocket reconnect). Spawns the daemon if needed.
    If X-Force-Kill: 1 is set, kill the daemon instead (admin override)."""
    if request.headers.get("X-Force-Kill") == "1":
        sess = sessions.sessions.pop(user_id, None)
        if sess is not None:
            sessions._kill(sess)
        return {"user_id": user_id, "pid": None, "killed": True}
    await sessions.touch(user_id)
    sess = sessions.sessions.get(user_id)
    return {
        "user_id": user_id,
        "pid": sess.pid if sess else None,
        "last_active": sess.last_active if sess else None,
    }


# ─── Write endpoints (skills + memory) ─────────────────────────────


def _ensure_profile(user_id: str) -> Path:
    """Create the user profile directory (USER.md, MEMORY.md) if missing.

    Triggered lazily by write endpoints so a fresh-registered user can
    immediately use the /skills and /memory APIs without first having to
    send a chat message.
    """
    profile = get_profile_dir(user_id)
    profile.mkdir(parents=True, exist_ok=True)
    (profile / "skills").mkdir(exist_ok=True)
    if not (profile / "USER.md").exists():
        (profile / "USER.md").write_text(f"# {user_id}\n\n_由 StudioArona 自动初始化_\n", encoding="utf-8")
    if not (profile / "MEMORY.md").exists():
        (profile / "MEMORY.md").write_text("# Memory\n\n_暂无记忆，开始和阿洛娜对话后会自动积累_\n", encoding="utf-8")
    return profile


def _slugify(text: str) -> str:
    import re
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff\-]+", "-", text.lower()).strip("-")
    return s or "skill"


@app.post("/v1/users/{user_id}/skills")
async def create_user_skill(user_id: str, request: Request) -> Dict[str, Any]:
    """Create a new skill under the user's profile.

    Body: {"slug": "my-skill", "name": "My Skill", "content": "..."}
    slug is auto-generated from name if missing.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body must be an object")
    name = (body.get("name") or "").strip()
    content = body.get("content", "")
    if not name:
        raise HTTPException(status_code=400, detail="'name' is required")
    slug = _slugify(body.get("slug") or name)
    profile = _ensure_profile(user_id)
    skill_dir = profile / "skills" / slug
    if (skill_dir / "SKILL.md").exists():
        raise HTTPException(status_code=409, detail=f"skill '{slug}' already exists")
    skill_dir.mkdir(parents=True, exist_ok=True)
    body_text = content if content.strip().startswith("#") else f"# {name}\n\n{content}"
    (skill_dir / "SKILL.md").write_text(body_text, encoding="utf-8")
    return {
        "user_id": user_id,
        "slug": slug,
        "name": name,
        "path": str((skill_dir / "SKILL.md").relative_to(get_hermes_home())),
    }


@app.patch("/v1/users/{user_id}/skills/{slug}")
async def update_user_skill(user_id: str, slug: str, request: Request) -> Dict[str, Any]:
    """Update an existing skill's content (or rename it)."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body must be an object")
    profile = get_profile_dir(user_id)
    skill_md = profile / "skills" / slug / "SKILL.md"
    if not skill_md.exists():
        raise HTTPException(status_code=404, detail=f"skill '{slug}' not found")
    new_slug = body.get("slug")
    new_content = body.get("content")
    new_name = body.get("name")
    # Rename if requested
    if new_slug and new_slug != slug:
        target = profile / "skills" / _slugify(new_slug)
        if target.exists():
            raise HTTPException(status_code=409, detail=f"target slug already exists")
        (skill_md.parent).rename(target)
        slug = _slugify(new_slug)
        skill_md = target / "SKILL.md"
    if new_content is not None:
        if new_name and not new_content.strip().startswith("#"):
            new_content = f"# {new_name}\n\n{new_content}"
        skill_md.write_text(new_content, encoding="utf-8")
    return {
        "user_id": user_id,
        "slug": slug,
        "name": new_name or slug,
        "path": str(skill_md.relative_to(get_hermes_home())),
    }


@app.delete("/v1/users/{user_id}/skills/{slug}")
async def delete_user_skill(user_id: str, slug: str) -> Dict[str, Any]:
    """Delete a skill directory and its SKILL.md."""
    import shutil
    profile = get_profile_dir(user_id)
    skill_dir = profile / "skills" / slug
    if not skill_dir.exists():
        raise HTTPException(status_code=404, detail=f"skill '{slug}' not found")
    shutil.rmtree(skill_dir)
    return {"user_id": user_id, "slug": slug, "deleted": True}


@app.put("/v1/users/{user_id}/memory")
async def write_user_memory(user_id: str, request: Request) -> Dict[str, Any]:
    """Overwrite USER.md and/or MEMORY.md for a user.

    Body: {"user_md": "...", "memory_md": "..."}
    Both fields are optional; only what's provided gets written.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body must be an object")
    profile = _ensure_profile(user_id)
    written = []
    if "user_md" in body:
        (profile / "USER.md").write_text(str(body["user_md"]), encoding="utf-8")
        written.append("user_md")
    if "memory_md" in body:
        (profile / "MEMORY.md").write_text(str(body["memory_md"]), encoding="utf-8")
        written.append("memory_md")
    return {"user_id": user_id, "written": written, "profile_dir": str(profile)}


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Any:
    """OpenAI-compatible chat completion endpoint.

    When X-User-Id is set:
      * spawn Hermes daemon for that user if not running
      * inject the per-user USER.md / MEMORY.md into the system prompt
      * filter <think>...</think> blocks
    """
    user_id = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")

    if user_id:
        await sessions.touch(user_id)
        # Fetch dynamic runtime context (temperature, schedules, VMs, weather)
        runtime = await _fetch_runtime_context()
        ctx = read_user_context(user_id, runtime=runtime)
        if ctx:
            messages = list(payload.get("messages") or [])
            # Insert/replace system prompt
            if messages and messages[0].get("role") == "system":
                messages[0]["content"] = ctx + "\n\n" + messages[0].get("content", "")
            else:
                messages.insert(0, {"role": "system", "content": ctx})
            payload["messages"] = messages
            logger.info("injected context for user=%s (runtime keys: %s)",
                        user_id, [k for k, v in (runtime or {}).items() if v])

    if payload.get("stream"):
        return StreamingResponse(
            stream_from_upstream(payload),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    api_key = get_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="MINIMAX_API_KEY not set")
    payload = {**payload}
    payload.setdefault("model", get_default_model())
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        r = await client.post(
            f"{get_upstream()}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    for choice in body.get("choices", []):
        msg = choice.get("message") or {}
        if "content" in msg and msg["content"]:
            cleaned, _ = strip_think(msg["content"], in_think=False)
            msg["content"] = cleaned
        if "reasoning_content" in msg:
            msg.pop("reasoning_content", None)
    return JSONResponse(body)


def main() -> None:
    load_env_file()
    port = int(os.environ.get("LLM_GATEWAY_PORT", str(DEFAULT_PORT)))
    host = os.environ.get("LLM_GATEWAY_HOST", "127.0.0.1")
    api_key = get_api_key()
    if not api_key:
        print(f"[llm_gateway] WARN: MINIMAX_API_KEY / MINIMAX_CN_API_KEY not set in env or .env.local")
    print(f"[llm_gateway] upstream={get_upstream()} default_model={get_default_model()} key_configured={bool(api_key)}")
    print(f"[llm_gateway] idle_timeout={get_idle_timeout()}s (30 min) pre-warm window={USER_ACTIVITY_WINDOW_DAYS}d")
    print(f"[llm_gateway] starting on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
