"""Linux VMBackend — VBoxManage CLI.

Placeholder for Linux stage.
"""

from __future__ import annotations

from app.core.vm.base import SshEndpoint, VM, VMBackend, VMSpec


class VBoxManageBackend:
    """VBoxManage-based VM backend. Not yet implemented."""

    async def list(self, owner_id: str | None = None) -> list[VM]:
        raise NotImplementedError("Linux VM: VBoxManage implementation pending Linux stage")

    async def create(self, spec: VMSpec, owner_id: str) -> VM:
        raise NotImplementedError("Linux VM: VBoxManage implementation pending Linux stage")

    async def start(self, id: str) -> None:
        raise NotImplementedError("Linux VM: VBoxManage implementation pending Linux stage")

    async def stop(self, id: str) -> None:
        raise NotImplementedError("Linux VM: VBoxManage implementation pending Linux stage")

    async def destroy(self, id: str) -> None:
        raise NotImplementedError("Linux VM: VBoxManage implementation pending Linux stage")

    async def upload(self, id: str, src_path: str, dst_path: str) -> None:
        raise NotImplementedError("Linux VM: VBoxManage implementation pending Linux stage")

    async def ssh_endpoint(self, id: str) -> SshEndpoint:
        raise NotImplementedError("Linux VM: VBoxManage implementation pending Linux stage")
