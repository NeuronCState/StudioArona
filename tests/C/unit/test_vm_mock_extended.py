"""Extended tests for MockVMBackend — covers more state transitions."""

from __future__ import annotations

import pytest

from app.core.vm.base import VMSpec
from app.core.vm.mock import MockVMBackend


@pytest.fixture
def backend():
    return MockVMBackend()


@pytest.mark.asyncio
async def test_create_and_list(backend):
    spec = VMSpec(name="vm1", cpu=2, mem_gb=4, disk_gb=20, image="ubuntu-22.04")
    await backend.create(spec, "user1")
    vms = await backend.list()
    assert len(vms) == 1
    assert vms[0].name == "vm1"


@pytest.mark.asyncio
async def test_create_multiple(backend):
    spec = VMSpec(name="vm1", cpu=1, mem_gb=2, disk_gb=10, image="ubuntu-22.04")
    await backend.create(spec, "user1")
    await backend.create(spec, "user2")
    await backend.create(spec, "user1")
    assert len(await backend.list()) == 3
    assert len(await backend.list("user1")) == 2


@pytest.mark.asyncio
async def test_destroy_already_destroyed(backend):
    spec = VMSpec(name="vm1", cpu=1, mem_gb=2, disk_gb=10, image="ubuntu-22.04")
    vm = await backend.create(spec, "user1")
    await backend.destroy(vm.id)
    with pytest.raises(ValueError, match="already destroyed"):
        await backend.destroy(vm.id)


@pytest.mark.asyncio
async def test_upload_not_running(backend):
    spec = VMSpec(name="vm1", cpu=1, mem_gb=2, disk_gb=10, image="ubuntu-22.04")
    vm = await backend.create(spec, "user1")
    with pytest.raises(ValueError, match="Cannot upload"):
        await backend.upload(vm.id, "/tmp/test.zip", "/tmp/test.zip")


@pytest.mark.asyncio
async def test_ssh_endpoint_not_running(backend):
    spec = VMSpec(name="vm1", cpu=1, mem_gb=2, disk_gb=10, image="ubuntu-22.04")
    vm = await backend.create(spec, "user1")
    with pytest.raises(ValueError, match="not running"):
        await backend.ssh_endpoint(vm.id)


@pytest.mark.asyncio
async def test_start_nonexistent(backend):
    with pytest.raises(KeyError):
        await backend.start("vm_nonexistent")
