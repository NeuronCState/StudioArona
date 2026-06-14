"""VM management API — /api/vms/* routes.

GET    /api/vms              → list VMs
POST   /api/vms              → create VM
DELETE /api/vms/{vmId}       → destroy VM
POST   /api/vms/{vmId}/upload → upload file to VM
GET    /api/vms/{vmId}/console → read VM console/serial log tail
POST   /api/vms/{vmId}/exec_enable → toggle exec_enabled
"""

from __future__ import annotations

import tempfile

from fastapi import APIRouter, HTTPException, Query, UploadFile

from app.core.vm.base import VM, VMSpec

router = APIRouter(prefix="/api/vms", tags=["VMs"])


def _get_vm_backend():
    from app.core.factory import create_vm_backend

    return create_vm_backend()


@router.get("", response_model=list[VM])
async def list_vms(owner_id: str | None = None) -> list[VM]:
    """List VMs, optionally filtered by owner."""
    backend = _get_vm_backend()
    return await backend.list(owner_id)


@router.post("", response_model=VM, status_code=201)
async def create_vm(spec: VMSpec, owner_id: str = "default") -> VM:
    """Create a new VM. Mac stage: mock state machine with 8s transition."""
    backend = _get_vm_backend()
    try:
        return await backend.create(spec, owner_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{vm_id}", status_code=204)
async def destroy_vm(vm_id: str) -> None:
    """Destroy a VM permanently."""
    backend = _get_vm_backend()
    try:
        await backend.destroy(vm_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"VM {vm_id} not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{vm_id}/upload")
async def upload_to_vm(vm_id: str, file: UploadFile) -> dict:
    """Upload a file to a running VM."""
    backend = _get_vm_backend()
    try:
        # In mock mode, just log the upload
        tmp_path = f"{tempfile.gettempdir()}/{file.filename}"
        await backend.upload(vm_id, file.filename or "unknown", tmp_path)
        return {"ok": True, "filename": file.filename}
    except KeyError:
        raise HTTPException(status_code=404, detail=f"VM {vm_id} not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{vm_id}/start")
async def start_vm(vm_id: str) -> dict:
    """Start a VM. Mac stage: mock state machine transition."""
    backend = _get_vm_backend()
    try:
        return await backend.start(vm_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"VM {vm_id} not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{vm_id}/stop")
async def stop_vm(vm_id: str) -> dict:
    """Stop a VM. Mac stage: mock state machine transition."""
    backend = _get_vm_backend()
    try:
        return await backend.stop(vm_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"VM {vm_id} not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{vm_id}/console")
async def read_vm_console(
    vm_id: str,
    lines: int = Query(default=50, ge=1, le=200, description="Number of log lines to return"),
) -> dict:
    """Read VM console / serial log tail.

    Returns {vm_id, lines: string, truncated: boolean}.
    In Mac mock mode, returns simulated boot log lines.
    """
    backend = _get_vm_backend()
    try:
        return await backend.console(vm_id, lines)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"VM {vm_id} not found") from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{vm_id}/exec_enable")
async def toggle_vm_exec(vm_id: str, body: dict) -> dict:
    """Toggle exec_enabled flag for this VM.

    Request body: {enabled: boolean}.
    Returns updated VM status including exec_enabled field.
    """
    enabled = body.get("enabled", False)
    if not isinstance(enabled, bool):
        raise HTTPException(status_code=422, detail="'enabled' must be a boolean")

    backend = _get_vm_backend()
    try:
        return await backend.toggle_exec(vm_id, enabled)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"VM {vm_id} not found") from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
