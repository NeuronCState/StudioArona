"""ha.toggle Skill handler."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    ha_client: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None

# Mock state store
_MOCK_STATES: dict[str, str] = {
    "light.studio_main": "on",
    "light.studio_accent": "off",
    "switch.studio_projector": "off",
}


async def handler(ctx: Context, **inputs: Any) -> Result:
    entity_id = inputs.get("entity_id")
    if not entity_id:
        return Result(ok=False, error="entity_id is required")

    if ctx.is_mock:
        return _mock_toggle(entity_id)

    if ctx.ha_client is None:
        return Result(ok=False, error="HomeAssistant client not available")

    try:
        new_state = await ctx.ha_client.toggle(entity_id)
        return Result(ok=True, data={"new_state": new_state})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_toggle(entity_id: str) -> Result:
    current = _MOCK_STATES.get(entity_id, "off")
    new_state = "off" if current == "on" else "on"
    _MOCK_STATES[entity_id] = new_state
    return Result(ok=True, data={"new_state": new_state, "entity_id": entity_id})
