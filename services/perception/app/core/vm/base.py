"""VMBackend protocol — abstract interface for VM management.

Mac mock: in-memory state machine
Linux: VBoxManage (Linux stage)
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class SshEndpoint(BaseModel):
    host: str
    port: int
    user: str


class VMSpec(BaseModel):
    name: str
    cpu: int
    mem_gb: int
    disk_gb: int
    image: str  # ubuntu-22.04 | cuda-12.x


class VM(BaseModel):
    id: str
    owner_id: str
    name: str
    cpu: int
    mem_gb: int
    disk_gb: int
    image: str
    status: str  # queued | creating | running | stopped | error | destroyed
    ssh_port: int | None = None
    created_at: str


@runtime_checkable
class VMBackend(Protocol):
    """Async VM backend protocol."""

    async def list(self, owner_id: str | None = None) -> list[VM]:
        """List VMs, optionally filtered by owner."""
        ...

    async def create(self, spec: VMSpec, owner_id: str) -> VM:
        """Create a new VM."""
        ...

    async def start(self, id: str) -> None:
        """Start a stopped VM."""
        ...

    async def stop(self, id: str) -> None:
        """Stop a running VM."""
        ...

    async def destroy(self, id: str) -> None:
        """Destroy a VM permanently."""
        ...

    async def upload(self, id: str, src_path: str, dst_path: str) -> None:
        """Upload file to VM."""
        ...

    async def ssh_endpoint(self, id: str) -> SshEndpoint:
        """Get SSH connection info."""
        ...

    async def console(self, id: str, lines: int = 50) -> dict:
        """Read VM console / serial log tail.
        Returns {"vm_id": str, "lines": str, "truncated": bool}
        """
        ...

    async def toggle_exec(self, id: str, enabled: bool) -> dict:
        """Enable or disable exec access on this VM.
        Returns updated VM status dict.
        """
        ...
