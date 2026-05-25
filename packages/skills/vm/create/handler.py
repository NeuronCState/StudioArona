"""vm.create Skill handler."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import uuid
import time


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
    name = inputs.get("name")
    if not name:
        return Result(ok=False, error="name is required")

    cpu = inputs.get("cpu", 2)
    mem_gb = inputs.get("mem_gb", 4)
    disk_gb = inputs.get("disk_gb", 20)
    image = inputs.get("image", "ubuntu-22.04")
    owner_id = inputs.get("owner_id", "default")

    if ctx.is_mock:
        return _mock_create(name, cpu, mem_gb, disk_gb, image, owner_id)

    if ctx.vm_backend is None:
        return Result(ok=False, error="VM backend not available")

    try:
        from app.core.vm.base import VMSpec

        spec = VMSpec(name=name, cpu=cpu, mem_gb=mem_gb, disk_gb=disk_gb, image=image)
        vm = await ctx.vm_backend.create(spec, owner_id)
        return Result(ok=True, data={"vm": vm.model_dump()})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_create(name, cpu, mem_gb, disk_gb, image, owner_id) -> Result:
    vm_id = f"vm_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return Result(ok=True, data={
        "vm": {
            "id": vm_id,
            "owner_id": owner_id,
            "name": name,
            "cpu": cpu,
            "mem_gb": mem_gb,
            "disk_gb": disk_gb,
            "image": image,
            "status": "creating",
            "ssh_port": None,
            "created_at": now,
            "note": "Mac mock: VM will transition to running in ~8 seconds",
        }
    })
