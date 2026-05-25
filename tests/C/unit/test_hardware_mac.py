"""Unit tests for Mac MetricsProvider.

Verifies:
- SystemMetrics structure matches contracts
- CPU/mem/disk fields are real (non-zero)
- GPU fields are mock (V100 with jitter)
- Training jobs are mock
"""

from __future__ import annotations

import pytest

from app.core.hardware.base import CPUCore, DiskUsage, GPU, SystemMetrics, TrainingJob
from app.core.hardware.mac import MacMetricsProvider


@pytest.fixture
def provider():
    return MacMetricsProvider()


@pytest.mark.asyncio
async def test_snapshot_returns_system_metrics(provider):
    metrics = await provider.snapshot()
    assert isinstance(metrics, SystemMetrics)


@pytest.mark.asyncio
async def test_cpu_cores_are_real(provider):
    metrics = await provider.snapshot()
    assert len(metrics.cpu_cores) > 0
    for core in metrics.cpu_cores:
        assert isinstance(core, CPUCore)
        assert core.index >= 0
        assert 0 <= core.util_pct <= 100
        assert core.freq_mhz >= 0


@pytest.mark.asyncio
async def test_memory_is_real(provider):
    metrics = await provider.snapshot()
    assert metrics.mem_total_mb > 0
    assert metrics.mem_used_mb > 0
    assert metrics.mem_used_mb <= metrics.mem_total_mb


@pytest.mark.asyncio
async def test_disks_are_real(provider):
    metrics = await provider.snapshot()
    assert len(metrics.disks) > 0
    for disk in metrics.disks:
        assert isinstance(disk, DiskUsage)
        assert disk.total_gb > 0
        assert disk.used_gb >= 0
        assert 0 <= disk.util_pct <= 100


@pytest.mark.asyncio
async def test_gpu_is_mock_v100(provider):
    metrics = await provider.snapshot()
    assert len(metrics.gpus) == 1
    gpu = metrics.gpus[0]
    assert isinstance(gpu, GPU)
    assert "V100" in gpu.name
    assert gpu.mem_total_mb == 16384
    assert 7000 <= gpu.mem_used_mb <= 9000  # base 8192 ± 500
    assert 30 <= gpu.util_pct <= 65  # base 48 ± 10 + margin
    assert 55 <= gpu.temp_c <= 70  # base 62 ± 3 + margin
    assert len(gpu.processes) > 0


@pytest.mark.asyncio
async def test_training_jobs_are_mock(provider):
    metrics = await provider.snapshot()
    assert len(metrics.training_jobs) >= 1
    for job in metrics.training_jobs:
        assert isinstance(job, TrainingJob)
        assert job.id.startswith("job_")
        assert job.status in ("running", "paused", "done", "error")
        assert job.current_step > 0


@pytest.mark.asyncio
async def test_timestamp_is_recent(provider):
    metrics = await provider.snapshot()
    # Timestamp should be within last 5 seconds
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    delta = (now - metrics.ts).total_seconds()
    assert 0 <= delta < 5
