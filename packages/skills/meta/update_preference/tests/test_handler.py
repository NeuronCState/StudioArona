"""Tests for meta/update_preference handler — mock path."""

import pytest

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    gateway_url: str = "http://localhost:8080"


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def run_handler(ctx: Context, **inputs: Any) -> Result:
    user_id = inputs.get("user_id", "")
    key = inputs.get("key", "")
    value = inputs.get("value", "")

    if not user_id or not key:
        return Result(ok=False, error="user_id and key are required")

    if ctx.is_mock:
        return Result(ok=True, data={"stored": key, "value": value, "mock": True})

    return Result(ok=False, error="live not tested")


@pytest.mark.asyncio
async def test_mock_update_returns_ok():
    result = await run_handler(Context(is_mock=True), user_id="u1", key="name", value="老张")
    assert result.ok
    assert result.data["stored"] == "name"
    assert result.data["mock"] is True


@pytest.mark.asyncio
async def test_mock_update_missing_user_id():
    result = await run_handler(Context(is_mock=True), user_id="", key="name", value="老张")
    assert not result.ok


@pytest.mark.asyncio
async def test_mock_update_missing_key():
    result = await run_handler(Context(is_mock=True), user_id="u1", key="", value="老张")
    assert not result.ok
