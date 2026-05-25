"""Mac MetricsProvider implementation.

Real: CPU cores, memory, disk usage (via psutil)
Mock: GPU (fixed V100 with ~50% jitter), training jobs (fake)
"""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone

import psutil
import structlog

from app.core.hardware.base import (
    CPUCore,
    DiskUsage,
    GPU,
    GpuProcess,
    SystemMetrics,
    TrainingJob,
)

logger = structlog.get_logger(subsystem="hardware")

# Fixed mock GPU config — V100 16GB
_MOCK_GPU_NAME = "Tesla V100-SXM2-16GB"
_MOCK_GPU_MEM_TOTAL = 16384  # MB
_MOCK_GPU_MEM_USED_BASE = 8192
_MOCK_GPU_UTIL_BASE = 48.0
_MOCK_GPU_TEMP_BASE = 62.0

_MOCK_TRAINING_JOBS = [
    {
        "id": "job_001",
        "user": "zhang",
        "name": "resnet50-finetune",
        "status": "running",
        "gpu_util_pct": 85.0,
        "current_step": 12400,
        "total_steps": 50000,
        "elapsed_h": 3.2,
        "eta_h": 9.8,
    },
    {
        "id": "job_002",
        "user": "li",
        "name": "bert-pretrain",
        "status": "running",
        "gpu_util_pct": 72.0,
        "current_step": 89000,
        "total_steps": 200000,
        "elapsed_h": 18.5,
        "eta_h": 22.1,
    },
]


class MacMetricsProvider:
    """Mac hardware metrics — real psutil + mock GPU."""

    async def snapshot(self) -> SystemMetrics:
        return await asyncio.to_thread(self._collect)

    def _collect(self) -> SystemMetrics:
        # CPU cores — real (interval=0 returns cached, non-blocking)
        cpu_pcts = psutil.cpu_percent(interval=0, percpu=True)
        cpu_freqs = psutil.cpu_freq(percpu=True)
        cpu_cores = []
        for i, pct in enumerate(cpu_pcts):
            freq = cpu_freqs[i].current if cpu_freqs and i < len(cpu_freqs) else 0.0
            cpu_cores.append(CPUCore(index=i, util_pct=pct, freq_mhz=freq))

        # Memory — real
        mem = psutil.virtual_memory()

        # Disks — real
        disks = []
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks.append(
                    DiskUsage(
                        mount=part.mountpoint,
                        total_gb=round(usage.total / (1024**3), 1),
                        used_gb=round(usage.used / (1024**3), 1),
                        util_pct=usage.percent,
                    )
                )
            except PermissionError:
                continue

        # GPU — mock with jitter
        mem_used = _MOCK_GPU_MEM_USED_BASE + random.randint(-500, 500)
        util_pct = max(0, min(100, _MOCK_GPU_UTIL_BASE + random.uniform(-10, 10)))
        temp_c = _MOCK_GPU_TEMP_BASE + random.uniform(-3, 3)

        gpus = [
            GPU(
                name=_MOCK_GPU_NAME,
                mem_total_mb=_MOCK_GPU_MEM_TOTAL,
                mem_used_mb=mem_used,
                util_pct=round(util_pct, 1),
                temp_c=round(temp_c, 1),
                processes=[
                    GpuProcess(pid=12345, name="python", user="zhang", gpu_mem_mb=6200),
                    GpuProcess(pid=12346, name="python", user="li", gpu_mem_mb=1800),
                ],
            )
        ]

        # Training jobs — mock
        jobs = []
        for j in _MOCK_TRAINING_JOBS:
            jobs.append(
                TrainingJob(
                    id=j["id"],
                    user=j["user"],
                    name=j["name"],
                    status=j["status"],
                    gpu_util_pct=j["gpu_util_pct"] + random.uniform(-2, 2),
                    current_step=j["current_step"] + random.randint(0, 50),
                    total_steps=j["total_steps"],
                    elapsed_h=round(j["elapsed_h"] + random.uniform(0, 0.1), 1),
                    eta_h=round(j["eta_h"] + random.uniform(-0.5, 0.5), 1) if j["eta_h"] else None,
                )
            )

        return SystemMetrics(
            ts=datetime.now(timezone.utc),
            cpu_cores=cpu_cores,
            mem_total_mb=round(mem.total / (1024**2)),
            mem_used_mb=round(mem.used / (1024**2)),
            disks=disks,
            gpus=gpus,
            training_jobs=jobs,
        )
