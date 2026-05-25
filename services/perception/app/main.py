"""Perception service entry point.

FastAPI application serving:
- /api/system/metrics — hardware monitoring
- /api/vms — VM lifecycle management
- /api/network/devices — network scanning
- /health — health check
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import network, speech, system, vms
from app.config import settings

# Configure structlog
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(service="perception")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "perception_starting",
        platform=settings.platform,
        port=settings.port,
        camera=settings.camera_device,
        serial=settings.serial_port,
        vm_backend=settings.vm_backend,
    )
    yield
    logger.info("perception_stopping")


app = FastAPI(
    title="Studio Arona Perception Service",
    description="人脸识别、外设抽象、硬件监控",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow api-gateway to proxy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # api-gateway handles real CORS
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(system.router)
app.include_router(vms.router)
app.include_router(network.router)
app.include_router(speech.router)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "perception",
        "platform": settings.platform,
    }
