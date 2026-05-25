"""ui/render_card Skill handler — render a card on the frontend."""

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
    component = inputs.get("component", "")
    props = inputs.get("props", {})

    if not component:
        return Result(ok=False, error="component name is required")

    return Result(ok=True, data={
        "ui_action": {"type": "render_card", "component": component, "props": props},
        "mock": ctx.is_mock,
    })
