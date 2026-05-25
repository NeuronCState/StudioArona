"""MetricsProvider protocol — abstract interface for hardware monitoring.

Mac: psutil (real CPU/mem) + mock GPU (fixed V100 with jitter)
Linux: psutil + nvidia-smi (Linux stage)
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class GpuProcess(BaseModel):
    pid: int
    name: str
    user: str
    gpu_mem_mb: int


class GPU(BaseModel):
    name: str
    mem_total_mb: int
    mem_used_mb: int
    util_pct: float
    temp_c: float
    processes: list[GpuProcess]


class CPUCore(BaseModel):
    index: int
    util_pct: float
    freq_mhz: float


class DiskUsage(BaseModel):
    mount: str
    total_gb: float
    used_gb: float
    util_pct: float


class TrainingJob(BaseModel):
    id: str
    user: str
    name: str
    status: str  # running | paused | done | error
    gpu_util_pct: float
    current_step: int
    total_steps: int | None
    elapsed_h: float
    eta_h: float | None


class SystemMetrics(BaseModel):
    ts: datetime
    cpu_cores: list[CPUCore]
    mem_total_mb: int
    mem_used_mb: int
    disks: list[DiskUsage]
    gpus: list[GPU]
    training_jobs: list[TrainingJob]


@runtime_checkable
class MetricsProvider(Protocol):
    """Async hardware metrics provider."""

    async def snapshot(self) -> SystemMetrics:
        """Return current system metrics snapshot."""
        ...
