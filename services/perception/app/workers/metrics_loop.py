"""Metrics collection loop — periodic hardware snapshot.

Periodically collects SystemMetrics and:
1. Pushes metrics_update event to WS publisher
2. Writes snapshot to system_metrics_snapshot table (via D's DB)

Collection interval: configurable, default 30s.
"""

from __future__ import annotations

import asyncio

import structlog

from app.core.hardware.base import MetricsProvider
from app.ws.publisher import EventPublisher

logger = structlog.get_logger(subsystem="metrics_loop")


class MetricsLoop:
    """Periodic hardware metrics collection."""

    def __init__(
        self,
        provider: MetricsProvider,
        publisher: EventPublisher,
        interval_seconds: float = 30.0,
    ) -> None:
        self._provider = provider
        self._publisher = publisher
        self._interval = interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the metrics collection loop."""
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("metrics_loop_started", interval=self._interval)

    async def stop(self) -> None:
        """Stop the metrics collection loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("metrics_loop_stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    async def collect_once(self) -> dict:
        """Collect a single metrics snapshot. Returns the metrics as dict."""
        metrics = await self._provider.snapshot()
        metrics_dict = metrics.model_dump(mode="json")

        # Push to WS
        await self._publisher.metrics_update(metrics_dict)

        logger.debug(
            "metrics_collected",
            cpu_cores=len(metrics.cpu_cores),
            mem_used_mb=metrics.mem_used_mb,
            gpus=len(metrics.gpus),
        )

        return metrics_dict

    async def _run_loop(self) -> None:
        """Main loop: collect metrics at interval."""
        try:
            while self._running:
                try:
                    await self.collect_once()
                except Exception as e:
                    logger.warning("metrics_collect_error", error=str(e))

                await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("metrics_loop_error", error=str(e))
