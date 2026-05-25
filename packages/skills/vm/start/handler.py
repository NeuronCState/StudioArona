"""vm.start Skill handler."""

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
    vm_id = inputs.get("vm_id")
    if not vm_id:
        return Result(ok=False, error="vm_id is required")

    if ctx.is_mock:
        return Result(ok=True, data={"status": "running", "vm_id": vm_id})

    if ctx.vm_backend is None:
        return Result(ok=False, error="VM backend not available")

    try:
        await ctx.vm_backend.start(vm_id)
        return Result(ok=True, data={"status": "running", "vm_id": vm_id})
    except KeyError:
        return Result(ok=False, error=f"VM {vm_id} not found")
    except ValueError as e:
        return Result(ok=False, error=str(e))
