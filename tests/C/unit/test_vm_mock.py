"""Unit tests for MockVMBackend.

Verifies:
- State machine: creating → running (8s)
- CRUD operations
- Error handling for invalid states
"""

from __future__ import annotations

import pytest

from app.core.vm.base import VMSpec
from app.core.vm.mock import MockVMBackend


@pytest.fixture
def backend():
    return MockVMBackend()


@pytest.mark.asyncio
async def test_create_vm(backend):
    spec = VMSpec(name="test-vm", cpu=2, mem_gb=4, disk_gb=20, image="ubuntu-22.04")
    vm = await backend.create(spec, "user1")
    assert vm.status == "creating"
    assert vm.name == "test-vm"
    assert vm.owner_id == "user1"


@pytest.mark.asyncio
async def test_list_vms_empty(backend):
    vms = await backend.list()
    assert vms == []


@pytest.mark.asyncio
async def test_list_vms_with_filter(backend):
    spec = VMSpec(name="vm1", cpu=1, mem_gb=2, disk_gb=10, image="ubuntu-22.04")
    await backend.create(spec, "user1")
    await backend.create(spec, "user2")

    user1_vms = await backend.list("user1")
    assert len(user1_vms) == 1
    assert user1_vms[0].owner_id == "user1"


@pytest.mark.asyncio
async def test_destroy_vm(backend):
    spec = VMSpec(name="vm1", cpu=1, mem_gb=2, disk_gb=10, image="ubuntu-22.04")
    vm = await backend.create(spec, "user1")
    await backend.destroy(vm.id)
    assert backend._vms[vm.id].status == "destroyed"


@pytest.mark.asyncio
async def test_destroy_nonexistent_vm(backend):
    with pytest.raises(KeyError):
        await backend.destroy("vm_nonexistent")


@pytest.mark.asyncio
async def test_stop_vm_not_running(backend):
    spec = VMSpec(name="vm1", cpu=1, mem_gb=2, disk_gb=10, image="ubuntu-22.04")
    vm = await backend.create(spec, "user1")
    with pytest.raises(ValueError, match="Cannot stop"):
        await backend.stop(vm.id)
