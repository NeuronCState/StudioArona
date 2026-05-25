"""System metrics API — /api/system/* routes.

GET /api/system/metrics → SystemMetrics snapshot
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.hardware.base import SystemMetrics

router = APIRouter(prefix="/api/system", tags=["System"])


def _get_metrics_provider():
    from app.core.factory import create_metrics_provider

    return create_metrics_provider()


@router.get("/metrics", response_model=SystemMetrics)
async def get_metrics() -> SystemMetrics:
    """Return current hardware metrics snapshot.

    Mac stage: real CPU/mem/disk + mock GPU (V100 with jitter).
    Linux stage: real nvidia-smi + psutil.
    """
    provider = _get_metrics_provider()
    try:
        return await provider.snapshot()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to collect metrics: {e}")
