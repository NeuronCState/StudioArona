"""Linux MetricsProvider implementation — psutil + nvidia-smi.

Placeholder for Linux stage. Will use real nvidia-smi for GPU metrics.
"""

from __future__ import annotations

from app.core.hardware.base import SystemMetrics


class LinuxMetricsProvider:
    """Linux hardware metrics — psutil + nvidia-smi. Not yet implemented."""

    async def snapshot(self) -> SystemMetrics:
        raise NotImplementedError(
            "Linux metrics: nvidia-smi + psutil implementation pending Linux stage"
        )
