"""vm.list Skill handler."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    vm_backend: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    owner_id = inputs.get("owner_id")

    if ctx.is_mock:
        return _mock_list(owner_id)

    if ctx.vm_backend is None:
        return Result(ok=False, error="VM backend not available")

    try:
        vms = await ctx.vm_backend.list(owner_id)
        return Result(ok=True, data={"vms": [vm.model_dump() for vm in vms]})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_list(owner_id: str | None) -> Result:
    vms = [
        {
            "id": "vm_abc12345",
            "owner_id": "zhang",
            "name": "dev-ubuntu",
            "cpu": 4,
            "mem_gb": 8,
            "disk_gb": 50,
            "image": "ubuntu-22.04",
            "status": "running",
            "ssh_port": 2222,
            "created_at": "2026-05-20T10:00:00Z",
        },
        {
            "id": "vm_def67890",
            "owner_id": "li",
            "name": "ml-training",
            "cpu": 8,
            "mem_gb": 16,
            "disk_gb": 100,
            "image": "cuda-12.x",
            "status": "running",
            "ssh_port": 2223,
            "created_at": "2026-05-19T15:30:00Z",
        },
        {
            "id": "vm_ghi11111",
            "owner_id": "zhang",
            "name": "test-env",
            "cpu": 2,
            "mem_gb": 4,
            "disk_gb": 20,
            "image": "ubuntu-22.04",
            "status": "stopped",
            "ssh_port": None,
            "created_at": "2026-05-18T09:00:00Z",
        },
    ]

    if owner_id:
        vms = [vm for vm in vms if vm["owner_id"] == owner_id]

    return Result(ok=True, data={"vms": vms})
