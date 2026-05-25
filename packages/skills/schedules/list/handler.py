"""schedules/list Skill handler — list today's schedules (schedules/today)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    if ctx.is_mock:
        return _mock_schedules()

    return Result(ok=False, error="Schedule backend not available in dev mode")


def _mock_schedules() -> Result:
    return Result(ok=True, data={
        "today": "2026-05-21",
        "schedules": [
            {"id": "sc1", "title": "团队站会", "time": "09:30", "location": "线上", "done": True},
            {"id": "sc2", "title": "代码评审", "time": "14:00", "location": "会议室 A", "done": False},
            {"id": "sc3", "title": "AI 模型训练 checkpoint", "time": "18:00", "location": "GPU 服务器", "done": False},
        ],
        "mock": True,
    })
