"""Unit tests for VM Skill handlers.

Verifies:
- vm.list: returns VM list
- vm.create: creates VM with spec
- vm.start/stop: state transitions
- vm.destroy: requires confirm
- vm.upload_archive: file validation
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Add skills to path
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
SKILLS_DIR = PROJECT_ROOT / "packages" / "skills"
sys.path.insert(0, str(SKILLS_DIR))


@pytest.fixture
def mock_ctx():
    from dataclasses import dataclass

    @dataclass
    class Ctx:
        is_mock: bool = True
        vm_backend: object = None

    return Ctx()


# ── vm.list ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vm_list_mock(mock_ctx):
    from vm.list.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is True
    assert "vms" in result.data
    assert len(result.data["vms"]) > 0


@pytest.mark.asyncio
async def test_vm_list_filter_owner(mock_ctx):
    from vm.list.handler import handler
    result = await handler(mock_ctx, owner_id="zhang")
    assert result.ok is True
    for vm in result.data["vms"]:
        assert vm["owner_id"] == "zhang"


# ── vm.create ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vm_create_mock(mock_ctx):
    from vm.create.handler import handler
    result = await handler(mock_ctx, name="test-vm", cpu=4, mem_gb=8)
    assert result.ok is True
    vm = result.data["vm"]
    assert vm["name"] == "test-vm"
    assert vm["cpu"] == 4
    assert vm["mem_gb"] == 8
    assert vm["status"] == "creating"


@pytest.mark.asyncio
async def test_vm_create_no_name(mock_ctx):
    from vm.create.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is False
    assert "name" in result.error


# ── vm.start ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vm_start_mock(mock_ctx):
    from vm.start.handler import handler
    result = await handler(mock_ctx, vm_id="vm_abc123")
    assert result.ok is True
    assert result.data["status"] == "running"


@pytest.mark.asyncio
async def test_vm_start_no_id(mock_ctx):
    from vm.start.handler import handler
    result = await handler(mock_ctx)
    assert result.ok is False


# ── vm.stop ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vm_stop_mock(mock_ctx):
    from vm.stop.handler import handler
    result = await handler(mock_ctx, vm_id="vm_abc123")
    assert result.ok is True
    assert result.data["status"] == "stopped"


# ── vm.destroy ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vm_destroy_no_confirm(mock_ctx):
    from vm.destroy.handler import handler
    result = await handler(mock_ctx, vm_id="vm_abc123")
    assert result.ok is False
    assert "confirm" in result.error


@pytest.mark.asyncio
async def test_vm_destroy_with_confirm(mock_ctx):
    from vm.destroy.handler import handler
    result = await handler(mock_ctx, vm_id="vm_abc123", confirm=True)
    assert result.ok is True
    assert result.data["status"] == "destroyed"


# ── vm.upload_archive ──────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_mock(mock_ctx, tmp_path):
    from vm.upload_archive.handler import handler

    # Create a temp file
    test_file = tmp_path / "test.zip"
    test_file.write_bytes(b"PK" + b"\x00" * 100)  # Fake zip header

    result = await handler(mock_ctx, vm_id="vm_abc123", file_path=str(test_file))
    assert result.ok is True
    assert result.data["filename"] == "test.zip"


@pytest.mark.asyncio
async def test_upload_file_not_found(mock_ctx):
    from vm.upload_archive.handler import handler
    result = await handler(mock_ctx, vm_id="vm_abc123", file_path="/nonexistent/file.zip")
    assert result.ok is False
    assert "not found" in result.error


@pytest.mark.asyncio
async def test_upload_no_vm_id(mock_ctx):
    from vm.upload_archive.handler import handler
    result = await handler(mock_ctx, file_path="/tmp/test.zip")
    assert result.ok is False
    assert "vm_id" in result.error
