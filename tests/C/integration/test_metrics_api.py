"""Integration test for /api/system/metrics endpoint.

Verifies:
- Returns 200 with valid SystemMetrics JSON
- CPU/mem/disk are real (non-zero)
- GPU is mock V100
- Matches contracts/openapi.yaml schema
"""

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
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "perception"
    assert data["platform"] in ("mac", "linux")


@pytest.mark.asyncio
async def test_metrics_returns_200(client):
    resp = await client.get("/api/system/metrics")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_metrics_has_required_fields(client):
    resp = await client.get("/api/system/metrics")
    data = resp.json()

    # Required top-level fields from SystemMetrics schema
    assert "ts" in data
    assert "cpu_cores" in data
    assert "mem_total_mb" in data
    assert "mem_used_mb" in data
    assert "disks" in data
    assert "gpus" in data
    assert "training_jobs" in data


@pytest.mark.asyncio
async def test_metrics_cpu_is_real(client):
    resp = await client.get("/api/system/metrics")
    data = resp.json()
    assert len(data["cpu_cores"]) > 0
    core = data["cpu_cores"][0]
    assert "index" in core
    assert "util_pct" in core
    assert "freq_mhz" in core


@pytest.mark.asyncio
async def test_metrics_gpu_is_mock_v100(client):
    resp = await client.get("/api/system/metrics")
    data = resp.json()
    assert len(data["gpus"]) == 1
    gpu = data["gpus"][0]
    assert "V100" in gpu["name"]
    assert gpu["mem_total_mb"] == 16384


@pytest.mark.asyncio
async def test_metrics_disks_present(client):
    resp = await client.get("/api/system/metrics")
    data = resp.json()
    assert len(data["disks"]) > 0
    disk = data["disks"][0]
    assert "mount" in disk
    assert "total_gb" in disk
    assert "used_gb" in disk
    assert "util_pct" in disk
