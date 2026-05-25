"""ui/toast Skill handler — show a toast notification."""

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
    message = inputs.get("message", "")
    level = inputs.get("level", "info")  # info / success / warning / error

    if not message:
        return Result(ok=False, error="message is required")

    if level not in ("info", "success", "warning", "error"):
        level = "info"

    return Result(ok=True, data={
        "ui_action": {"type": "toast", "message": message, "level": level},
        "mock": ctx.is_mock,
    })
