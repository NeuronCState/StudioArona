"""system.metrics_snapshot Skill handler."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    metrics_provider: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    if ctx.is_mock:
        return _mock_metrics()

    if ctx.metrics_provider is None:
        return Result(ok=False, error="Metrics provider not available")

    try:
        metrics = await ctx.metrics_provider.snapshot()
        return Result(ok=True, data={"metrics": metrics.model_dump(mode="json")})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_metrics() -> Result:
    now = datetime.now(timezone.utc)
    import psutil

    cpu_pcts = psutil.cpu_percent(interval=0.1, percpu=True)
    mem = psutil.virtual_memory()

    cpu_cores = [{"index": i, "util_pct": pct, "freq_mhz": 0} for i, pct in enumerate(cpu_pcts)]

    return Result(ok=True, data={
        "metrics": {
            "ts": now.isoformat(),
            "cpu_cores": cpu_cores,
            "mem_total_mb": round(mem.total / (1024**2)),
            "mem_used_mb": round(mem.used / (1024**2)),
            "disks": [{"mount": "/", "total_gb": 460, "used_gb": 120, "util_pct": 26}],
            "gpus": [{
                "name": "Tesla V100-SXM2-16GB",
                "mem_total_mb": 16384,
                "mem_used_mb": 8192 + random.randint(-500, 500),
                "util_pct": round(48 + random.uniform(-10, 10), 1),
                "temp_c": round(62 + random.uniform(-3, 3), 1),
                "processes": [
                    {"pid": 12345, "name": "python", "user": "zhang", "gpu_mem_mb": 6200},
                    {"pid": 12346, "name": "python", "user": "li", "gpu_mem_mb": 1800},
                ],
            }],
            "training_jobs": [
                {"id": "job_001", "user": "zhang", "name": "resnet50-finetune", "status": "running",
                 "gpu_util_pct": 85, "current_step": 12400, "total_steps": 50000, "elapsed_h": 3.2, "eta_h": 9.8},
                {"id": "job_002", "user": "li", "name": "bert-pretrain", "status": "running",
                 "gpu_util_pct": 72, "current_step": 89000, "total_steps": 200000, "elapsed_h": 18.5, "eta_h": 22.1},
            ],
        }
    })
