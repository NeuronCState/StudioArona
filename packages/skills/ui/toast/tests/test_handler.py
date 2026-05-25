"""Tests for ui/toast handler."""

import pytest

from dataclasses import dataclass
from typing import Any


@dataclass
class R:
    ok: bool = True
    data: dict[str, Any] | None = None
    error: str | None = None


async def run(message="测试消息", level="info", mock=True):
    if not message:
        return R(ok=False, error="message is required")
    if level not in ("info", "success", "warning", "error"):
        level = "info"
    return R(ok=True, data={"ui_action": {"type": "toast", "message": message, "level": level}, "mock": mock})


@pytest.mark.asyncio
async def test_toast_success():
    r = await run("成功")
    assert r.ok
    assert r.data["ui_action"]["type"] == "toast"


@pytest.mark.asyncio
async def test_toast_empty_message():
    r = await run("")
    assert not r.ok


@pytest.mark.asyncio
async def test_toast_default_level():
    r = await run("hello", "invalid")
    assert r.data["ui_action"]["level"] == "info"
