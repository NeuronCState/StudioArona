"""Unit tests for background workers.

Verifies:
- MetricsLoop: collect_once produces valid metrics
- VMStatusLoop: poll_once returns VM list
"""

from __future__ import annotations

import pytest

from app.core.hardware.mac import MacMetricsProvider
from app.core.vm.mock import MockVMBackend
from app.ws.publisher import EventPublisher
from app.workers.metrics_loop import MetricsLoop
from app.workers.vm_status_loop import VMStatusLoop


@pytest.fixture
def publisher():
    return EventPublisher()


@pytest.mark.asyncio
async def test_metrics_loop_collect_once(publisher):
    provider = MacMetricsProvider()
    loop = MetricsLoop(provider, publisher, interval_seconds=1.0)

    metrics = await loop.collect_once()
    assert "ts" in metrics
    assert "cpu_cores" in metrics
    assert "gpus" in metrics
    assert len(metrics["cpu_cores"]) > 0


@pytest.mark.asyncio
async def test_metrics_loop_start_stop(publisher):
    provider = MacMetricsProvider()
    loop = MetricsLoop(provider, publisher, interval_seconds=0.1)

    await loop.start()
    assert loop.is_running is True

    # Let it run briefly
    import asyncio
    await asyncio.sleep(0.3)

    await loop.stop()
    assert loop.is_running is False


@pytest.mark.asyncio
async def test_vm_status_loop_poll_once(publisher):
    backend = MockVMBackend()
    loop = VMStatusLoop(backend, publisher, interval_seconds=1.0)

    vms = await loop.poll_once()
    assert isinstance(vms, list)
    # Empty initially
    assert len(vms) == 0


@pytest.mark.asyncio
async def test_vm_status_loop_with_vms(publisher):
    from app.core.vm.base import VMSpec

    backend = MockVMBackend()
    # Create a VM first
    spec = VMSpec(name="test", cpu=2, mem_gb=4, disk_gb=20, image="ubuntu-22.04")
    await backend.create(spec, "user1")

    loop = VMStatusLoop(backend, publisher, interval_seconds=1.0)
    vms = await loop.poll_once()
    assert len(vms) == 1
    assert vms[0]["name"] == "test"
