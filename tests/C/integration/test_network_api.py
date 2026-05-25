"""Integration tests for /api/network/devices endpoint."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_devices(client):
    resp = await client.get("/api/network/devices")
    assert resp.status_code == 200
    devices = resp.json()
    assert isinstance(devices, list)
    assert len(devices) == 12
    assert "ip" in devices[0]
    assert "online" in devices[0]
