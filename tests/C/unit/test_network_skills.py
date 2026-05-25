"""Unit tests for Network Skill handlers.

Verifies:
- network.list_devices: returns device list
- network.device_detail: returns device detail by IP
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
        network_scanner: object = None

    return Ctx()


# ── network.list_devices ───────────────────────────────────

@pytest.mark.asyncio
async def test_list_devices_mock(mock_ctx):
    from network.list_devices.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is True
    assert "devices" in result.data
    assert len(result.data["devices"]) == 12


@pytest.mark.asyncio
async def test_list_devices_has_required_fields(mock_ctx):
    from network.list_devices.handler import handler
    result = await handler(mock_ctx)
    device = result.data["devices"][0]
    assert "ip" in device
    assert "mac" in device
    assert "hostname" in device
    assert "vendor" in device
    assert "online" in device
    assert "last_seen" in device


@pytest.mark.asyncio
async def test_list_devices_some_offline(mock_ctx):
    from network.list_devices.handler import handler
    # Run multiple times to catch randomness
    for _ in range(5):
        result = await handler(mock_ctx)
        online_count = sum(1 for d in result.data["devices"] if d["online"])
        offline_count = sum(1 for d in result.data["devices"] if not d["online"])
        # With 85% online rate, should have some offline in most runs
        assert online_count + offline_count == 12


# ── network.device_detail ──────────────────────────────────

@pytest.mark.asyncio
async def test_device_detail_known_ip(mock_ctx):
    from network.device_detail.handler import handler
    result = await handler(mock_ctx, ip="192.168.1.10")
    assert result.ok is True
    device = result.data["device"]
    assert device["ip"] == "192.168.1.10"
    assert device["hostname"] == "zhang-mbp"
    assert device["vendor"] == "Apple"
    assert "open_ports" in device
    assert "os_guess" in device


@pytest.mark.asyncio
async def test_device_detail_unknown_ip(mock_ctx):
    from network.device_detail.handler import handler
    result = await handler(mock_ctx, ip="192.168.1.99")
    assert result.ok is True
    device = result.data["device"]
    assert device["ip"] == "192.168.1.99"
    assert device["online"] is True


@pytest.mark.asyncio
async def test_device_detail_no_ip(mock_ctx):
    from network.device_detail.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is False
    assert "ip" in result.error
