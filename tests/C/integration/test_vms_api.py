"""Integration tests for /api/vms endpoints."""

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
async def test_list_vms(client):
    resp = await client.get("/api/vms")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_vm(client):
    resp = await client.post("/api/vms", json={
        "name": "test-vm",
        "cpu": 2,
        "mem_gb": 4,
        "disk_gb": 20,
        "image": "ubuntu-22.04",
    }, params={"owner_id": "test"})
    assert resp.status_code == 201
    vm = resp.json()
    assert vm["name"] == "test-vm"
    assert vm["status"] == "creating"


@pytest.mark.asyncio
async def test_destroy_vm_not_found(client):
    resp = await client.delete("/api/vms/vm_nonexistent")
    assert resp.status_code == 404
