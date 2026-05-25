"""ui/navigate Skill handler — navigate frontend to a route."""

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
    route = inputs.get("to", "/")
    if not route.startswith("/"):
        return Result(ok=False, error=f"Invalid route: {route}")

    return Result(ok=True, data={
        "ui_action": {"type": "navigate", "to": route},
        "mock": ctx.is_mock,
    })
