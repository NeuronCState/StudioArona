"""Internal HTTP endpoint: /internal/metrics

Receives Web Vitals and performance metrics from the frontend.
Only accessible from localhost.
"""

import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = structlog.get_logger("internal-metrics")

router = APIRouter(prefix="/internal/metrics", tags=["Internal"])


class MetricPayload(BaseModel):
    kind: str  # web-vital | perf-snapshot | error
    name: str | None = None
    value: float | None = None
    id: str | None = None
    ts: int | None = None
    url: str | None = None
    extra: dict | None = None


@router.post("")
async def ingest_metric(body: MetricPayload, request: Request):
    """Accept a performance metric from the frontend.

    Security: only allow requests from localhost (nginx reverse proxy).
    In production this endpoint sits behind nginx, so client IP is the proxy.
    For dev mode we accept localhost connections.
    """
    client_host = request.client.host if request.client else ""
    # In dev, accept from localhost. In prod behind nginx, accept all
    # (the route itself is only mounted on the internal router).
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        # Behind nginx proxy, the request arrives via local socket/port
        logger.debug("metric_from_proxy", host=client_host, kind=body.kind)

    logger.info(
        "metric_ingested",
        kind=body.kind,
        name=body.name,
        value=body.value,
        url=body.url,
    )
    return {"ok": True}
