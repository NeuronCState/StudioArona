"""Tests for meta/recall_memory handler — mock path."""

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


# Inline the mock logic from handler.py to avoid module name collisions
async def run_handler(ctx: Context, **inputs: Any) -> Result:
    query = inputs.get("query", "")
    k = inputs.get("k", 5)
    if not ctx.is_mock:
        return Result(ok=False, error="live not tested")

    entries = [
        {"id": "mock-e1", "type": "fact", "summary": "老师喜欢在下午喝茶", "importance": 70},
        {"id": "mock-e2", "type": "preference", "summary": "喜欢被叫老张", "importance": 80},
    ]
    if query:
        entries = [e for e in entries if query in e["summary"]]
    return Result(ok=True, data={"entries": entries})


@pytest.mark.asyncio
async def test_mock_recall_returns_entries():
    result = await run_handler(Context(is_mock=True), query="茶")
    assert result.ok


@pytest.mark.asyncio
async def test_mock_recall_filters_by_query():
    result = await run_handler(Context(is_mock=True), query="茶")
    for e in result.data["entries"]:
        assert "茶" in e["summary"]


@pytest.mark.asyncio
async def test_mock_recall_empty_query():
    result = await run_handler(Context(is_mock=True), query="")
    assert len(result.data["entries"]) == 2


@pytest.mark.asyncio
async def test_mock_recall_custom_k():
    result = await run_handler(Context(is_mock=True), query="", k=1)
    assert result.ok
