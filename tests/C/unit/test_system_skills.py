"""Unit tests for System Skill handlers.

Verifies:
- system.metrics_snapshot: returns metrics
- system.list_training_jobs: returns job list
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
SKILLS_DIR = PROJECT_ROOT / "packages" / "skills"
sys.path.insert(0, str(SKILLS_DIR))


@pytest.fixture
def mock_ctx():
    from dataclasses import dataclass

    @dataclass
    class Ctx:
        is_mock: bool = True
        metrics_provider: object = None

    return Ctx()


@pytest.mark.asyncio
async def test_metrics_snapshot(mock_ctx):
    from system.metrics_snapshot.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is True
    m = result.data["metrics"]
    assert "ts" in m
    assert "cpu_cores" in m
    assert "gpus" in m
    assert "training_jobs" in m
    assert len(m["cpu_cores"]) > 0


@pytest.mark.asyncio
async def test_metrics_gpu_is_v100(mock_ctx):
    from system.metrics_snapshot.handler import handler
    result = await handler(mock_ctx)
    gpu = result.data["metrics"]["gpus"][0]
    assert "V100" in gpu["name"]
    assert gpu["mem_total_mb"] == 16384


@pytest.mark.asyncio
async def test_list_training_jobs(mock_ctx):
    from system.list_training_jobs.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is True
    assert len(result.data["jobs"]) == 2
    for job in result.data["jobs"]:
        assert "id" in job
        assert "user" in job
        assert "name" in job
        assert "status" in job
        assert "current_step" in job
        assert "total_steps" in job
