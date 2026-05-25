"""system.list_training_jobs Skill handler."""

from __future__ import annotations

import random
from dataclasses import dataclass
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


_MOCK_JOBS = [
    {"id": "job_001", "user": "zhang", "name": "resnet50-finetune", "status": "running",
     "gpu_util_pct": 85.0, "current_step": 12400, "total_steps": 50000, "elapsed_h": 3.2, "eta_h": 9.8},
    {"id": "job_002", "user": "li", "name": "bert-pretrain", "status": "running",
     "gpu_util_pct": 72.0, "current_step": 89000, "total_steps": 200000, "elapsed_h": 18.5, "eta_h": 22.1},
]


async def handler(ctx: Context, **inputs: Any) -> Result:
    if ctx.is_mock:
        return _mock_list()

    if ctx.metrics_provider is None:
        return Result(ok=False, error="Metrics provider not available")

    try:
        metrics = await ctx.metrics_provider.snapshot()
        return Result(ok=True, data={"jobs": [j.model_dump() for j in metrics.training_jobs]})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_list() -> Result:
    jobs = []
    for j in _MOCK_JOBS:
        jobs.append({
            **j,
            "gpu_util_pct": j["gpu_util_pct"] + random.uniform(-2, 2),
            "current_step": j["current_step"] + random.randint(0, 50),
            "elapsed_h": round(j["elapsed_h"] + random.uniform(0, 0.1), 1),
            "eta_h": round(j["eta_h"] + random.uniform(-0.5, 0.5), 1),
        })
    return Result(ok=True, data={"jobs": jobs})
