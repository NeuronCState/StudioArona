"""Studio Javis API Gateway — FastAPI application entry point."""

import structlog
from fastapi import FastAPI

from app.api import auth, health, me, users, weather
from app.api.upload import router as upload_router
from app.internal.events import router as internal_events_router
from app.internal.memory_api import router as internal_memory_router
from app.internal.metrics import router as internal_metrics_router
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
        title="Studio Javis API Gateway",
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
    app.include_router(upload_router)
    app.include_router(weather.router)

    # ── WebSocket event bus ────────────────
    app.include_router(ws_router)

    # ── Internal endpoints (localhost only) ──
    app.include_router(internal_events_router)
    app.include_router(internal_memory_router)
    app.include_router(internal_metrics_router)

    # ── Proxy routes (forward to agent/perception) ──
    app.include_router(proxy_router)

    return app


app = create_app()
