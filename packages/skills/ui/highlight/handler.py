"""ui/highlight Skill handler — highlight an element on the frontend."""

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
    target = inputs.get("selector", inputs.get("target", ""))
    if not target:
        return Result(ok=False, error="selector or target is required")

    return Result(ok=True, data={
        "ui_action": {"type": "highlight", "selector": target},
        "mock": ctx.is_mock,
    })
