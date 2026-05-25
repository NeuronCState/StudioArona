"""ui/clear_session Skill handler — clear current session display."""

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
    return Result(ok=True, data={
        "ui_action": {"type": "clear_session"},
        "mock": ctx.is_mock,
    })
