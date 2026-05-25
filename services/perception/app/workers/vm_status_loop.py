"""VM status loop — periodic VM status polling.

Periodically polls VM status and pushes updates.
In Mac mock mode, this drives the state machine transitions.
"""

from __future__ import annotations

import asyncio

import structlog

from app.core.vm.base import VMBackend
from app.ws.publisher import EventPublisher

logger = structlog.get_logger(subsystem="vm_status_loop")


class VMStatusLoop:
    """Periodic VM status polling."""

    def __init__(
        self,
        vm_backend: VMBackend,
        publisher: EventPublisher,
        interval_seconds: float = 10.0,
    ) -> None:
        self._backend = vm_backend
        self._publisher = publisher
        self._interval = interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the VM status loop."""
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("vm_status_loop_started", interval=self._interval)

    async def stop(self) -> None:
        """Stop the VM status loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("vm_status_loop_stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    async def poll_once(self) -> list[dict]:
        """Poll VM status once. Returns list of VM dicts."""
        vms = await self._backend.list()
        vm_dicts = [vm.model_dump() for vm in vms]

        logger.debug("vm_status_polled", count=len(vm_dicts))
        return vm_dicts

    async def _run_loop(self) -> None:
        """Main loop: poll VM status at interval."""
        try:
            while self._running:
                try:
                    await self.poll_once()
                except Exception as e:
                    logger.warning("vm_poll_error", error=str(e))

                await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("vm_status_loop_error", error=str(e))
