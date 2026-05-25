"""Unit tests for MockNetworkScanner."""

from __future__ import annotations

import pytest

from app.core.network.mock import MockNetworkScanner


@pytest.fixture
def scanner():
    return MockNetworkScanner()


@pytest.mark.asyncio
async def test_scan_returns_devices(scanner):
    devices = await scanner.scan()
    assert len(devices) == 12


@pytest.mark.asyncio
async def test_scan_devices_have_fields(scanner):
    devices = await scanner.scan()
    d = devices[0]
    assert d.ip == "192.168.1.1"
    assert d.mac != ""
    assert d.hostname != ""
    assert d.vendor != ""
    assert isinstance(d.online, bool)


@pytest.mark.asyncio
async def test_device_info_known(scanner):
    detail = await scanner.device_info("192.168.1.10")
    assert detail.ip == "192.168.1.10"
    assert detail.hostname == "zhang-mbp"
    assert len(detail.open_ports) > 0


@pytest.mark.asyncio
async def test_device_info_unknown(scanner):
    with pytest.raises(KeyError):
        await scanner.device_info("10.0.0.1")
