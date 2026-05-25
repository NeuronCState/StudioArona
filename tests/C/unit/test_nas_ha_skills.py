"""Unit tests for NAS and HA Skill handlers.

Verifies:
- nas.list_recent: returns file list
- nas.search: searches by query
- ha.list_devices: returns device list
- ha.toggle: toggles device state
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
SKILLS_DIR = PROJECT_ROOT / "packages" / "skills"
sys.path.insert(0, str(SKILLS_DIR))


@pytest.fixture
def mock_ctx():
    from dataclasses import dataclass

    @dataclass
    class Ctx:
        is_mock: bool = True
        nas_client: object = None
        ha_client: object = None

    return Ctx()


# ── nas.list_recent ────────────────────────────────────────

@pytest.mark.asyncio
async def test_nas_list_recent(mock_ctx):
    from nas.list_recent.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is True
    assert "items" in result.data
    assert len(result.data["items"]) > 0


@pytest.mark.asyncio
async def test_nas_list_recent_with_limit(mock_ctx):
    from nas.list_recent.handler import handler
    result = await handler(mock_ctx, limit=3)
    assert result.ok is True
    assert len(result.data["items"]) <= 3


@pytest.mark.asyncio
async def test_nas_list_recent_filter_user(mock_ctx):
    from nas.list_recent.handler import handler
    result = await handler(mock_ctx, user_id="zhang")
    assert result.ok is True
    for item in result.data["items"]:
        assert item["user"] == "zhang"


@pytest.mark.asyncio
async def test_nas_list_recent_has_fields(mock_ctx):
    from nas.list_recent.handler import handler
    result = await handler(mock_ctx, limit=1)
    item = result.data["items"][0]
    assert "name" in item
    assert "path" in item
    assert "size_mb" in item
    assert "user" in item
    assert "modified_at" in item


# ── nas.search ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_nas_search(mock_ctx):
    from nas.search.handler import handler
    result = await handler(mock_ctx, query="project")
    assert result.ok is True
    assert "items" in result.data


@pytest.mark.asyncio
async def test_nas_search_no_query(mock_ctx):
    from nas.search.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is False
    assert "query" in result.error


@pytest.mark.asyncio
async def test_nas_search_has_relevance(mock_ctx):
    from nas.search.handler import handler
    result = await handler(mock_ctx, query="training")
    for item in result.data["items"]:
        assert "relevance" in item


# ── ha.list_devices ────────────────────────────────────────

@pytest.mark.asyncio
async def test_ha_list_devices(mock_ctx):
    from ha.list_devices.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is True
    assert "devices" in result.data
    assert len(result.data["devices"]) == 10


@pytest.mark.asyncio
async def test_ha_list_devices_has_fields(mock_ctx):
    from ha.list_devices.handler import handler
    result = await handler(mock_ctx)
    device = result.data["devices"][0]
    assert "entity_id" in device
    assert "name" in device
    assert "state" in device
    assert "type" in device


# ── ha.toggle ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ha_toggle(mock_ctx):
    from ha.toggle.handler import handler
    result = await handler(mock_ctx, entity_id="light.studio_main")
    assert result.ok is True
    assert "new_state" in result.data


@pytest.mark.asyncio
async def test_ha_toggle_no_entity(mock_ctx):
    from ha.toggle.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is False
    assert "entity_id" in result.error


@pytest.mark.asyncio
async def test_ha_toggle_inverts_state(mock_ctx):
    from ha.toggle.handler import handler
    # First toggle
    r1 = await handler(mock_ctx, entity_id="light.studio_accent")
    s1 = r1.data["new_state"]
    # Second toggle should invert
    r2 = await handler(mock_ctx, entity_id="light.studio_accent")
    s2 = r2.data["new_state"]
    assert s1 != s2
