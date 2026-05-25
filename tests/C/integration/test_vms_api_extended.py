"""Extended integration tests for /api/vms — covers more API paths."""

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
async def test_list_vms_with_owner(client):
    resp = await client.get("/api/vms", params={"owner_id": "zhang"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_vm_returns_correct_fields(client):
    resp = await client.post("/api/vms", json={
        "name": "test-vm",
        "cpu": 4,
        "mem_gb": 8,
        "disk_gb": 50,
        "image": "cuda-12.x",
    })
    assert resp.status_code == 201
    vm = resp.json()
    assert vm["name"] == "test-vm"
    assert vm["cpu"] == 4
    assert vm["mem_gb"] == 8
    assert vm["disk_gb"] == 50
    assert vm["image"] == "cuda-12.x"
    assert vm["status"] == "creating"


@pytest.mark.asyncio
async def test_destroy_nonexistent_vm(client):
    resp = await client.delete("/api/vms/vm_nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_nonexistent_vm(client):
    import io
    files = {"file": ("test.zip", io.BytesIO(b"PK\x00\x00"), "application/zip")}
    resp = await client.post("/api/vms/vm_nonexistent/upload", files=files)
    assert resp.status_code == 404
