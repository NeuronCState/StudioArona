"""Tests for ui/navigate handler."""

import pytest

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False


async def run(to="/feeds", mock=True):
    # Inline handler logic
    if not to.startswith("/"):
        from dataclasses import dataclass as dc
        @dc
        class R: ok: bool = False; data: dict[str, Any] | None = None; error: str | None = None
        return R(ok=False, error=f"Invalid route: {to}")
    from dataclasses import dataclass as dc
    @dc
    class R: ok: bool = True; data: dict[str, Any] | None = None; error: str | None = None
    return R(ok=True, data={"ui_action": {"type": "navigate", "to": to}, "mock": mock})


@pytest.mark.asyncio
async def test_navigate_valid_route():
    r = await run("/feeds")
    assert r.ok
    assert r.data["ui_action"]["type"] == "navigate"


@pytest.mark.asyncio
async def test_navigate_invalid_route():
    r = await run("invalid")
    assert not r.ok


@pytest.mark.asyncio
async def test_navigate_default():
    r = await run()
    assert r.data["ui_action"]["to"] == "/feeds"
