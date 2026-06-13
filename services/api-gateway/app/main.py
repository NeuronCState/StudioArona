"""Studio Arona API Gateway — FastAPI application entry point."""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI

# Load .env.local (overrides .env.example defaults) at import time so SMTP/OAuth
# env is available before any module reads it.
_PROJECT_ROOT = Path(__file__).resolve().parents[3]  # services/api-gateway/app/main.py → StudioArona/
for _env_name in (".env.local", ".env"):
    _env_path = _PROJECT_ROOT / _env_name
    if _env_path.exists():
        load_dotenv(_env_path, override=False)  # .env.local 优先，但已存在的 os.environ 不被覆盖

from app.api import auth, health, me, users, weather, admin
from app.api.skills_marketplace import router as marketplace_router
from app.api.upload import router as upload_router
from app.internal.events import router as internal_events_router
from app.internal.memory_api import router as internal_memory_router
from app.internal.metrics import router as internal_metrics_router
from app.internal.notify_rss import router as internal_notify_rss_router
from app.middleware.csrf import CSRFMiddleware
from app.middleware.error_handler import ErrorHandlerMiddleware
from app.middleware.logging import LoggingMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.proxy.forward import close_client
from app.proxy.routes import router as proxy_router
from app.ws.routes import router as ws_router

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer() if True else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Studio Arona API Gateway",
        version="0.1.0",
        docs_url="/docs",
        
        redoc_url=None,
        on_shutdown=[close_client],
    )

    # ── Middleware (outermost first) ────────
    app.add_middleware(ErrorHandlerMiddleware)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(CSRFMiddleware)

    # ── CORS (dev: allow all) ──────────────
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ────────────────────────────
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(users.router)
    app.include_router(admin.router)
    app.include_router(upload_router)
    app.include_router(marketplace_router)
    app.include_router(weather.router)

    # ── WebSocket event bus ────────────────
    app.include_router(ws_router)

    # ── Internal endpoints (localhost only) ──
    app.include_router(internal_events_router)
    app.include_router(internal_memory_router)
    app.include_router(internal_metrics_router)
    app.include_router(internal_notify_rss_router)

    # ── Admin endpoints (admin role required) ──

    # ── Proxy routes (forward to agent/perception) ──
    app.include_router(proxy_router)

    # ── Wire notifier user resolver (lazy import to dodge circular) ──
    from sqlalchemy import select
    from app.db.session import async_session_factory
    from app.models.user import User
    from app.notifier.email import scheduler as _notif_scheduler

    async def _resolve_users():
        async with async_session_factory() as db:
            rows = (await db.execute(select(User))).scalars().all()
            return [(u.id, u.email, u.display_name, u.role) for u in rows]

    _notif_scheduler.set_resolver(_resolve_users)

    return app


app = create_app()
