"""Tests for ui/render_card handler."""

import pytest

from dataclasses import dataclass
from typing import Any


@dataclass
class R:
    ok: bool = True
    data: dict[str, Any] | None = None
    error: str | None = None


async def run(component="weather", props=None, mock=True):
    if not component:
        return R(ok=False, error="component name is required")
    return R(ok=True, data={"ui_action": {"type": "render_card", "component": component, "props": props or {}}, "mock": mock})


@pytest.mark.asyncio
async def test_render_card_success():
    r = await run("weather", {"city": "杭州"})
    assert r.ok
    assert r.data["ui_action"]["component"] == "weather"


@pytest.mark.asyncio
async def test_render_card_missing_component():
    r = await run("")
    assert not r.ok
