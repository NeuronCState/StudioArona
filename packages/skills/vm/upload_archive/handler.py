"""vm.upload_archive Skill handler."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import os


@dataclass
class Context:
    is_mock: bool = False
    vm_backend: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


# Max file size: 100MB
_MAX_FILE_SIZE = 100 * 1024 * 1024

# Allowed extensions
_ALLOWED_EXTENSIONS = {".zip", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".gz", ".bz2", ".xz"}


async def handler(ctx: Context, **inputs: Any) -> Result:
    vm_id = inputs.get("vm_id")
    file_path = inputs.get("file_path")
    dst_path = inputs.get("dst_path", "/tmp/upload")

    if not vm_id:
        return Result(ok=False, error="vm_id is required")
    if not file_path:
        return Result(ok=False, error="file_path is required")

    # Validate file exists
    if not os.path.exists(file_path):
        return Result(ok=False, error=f"File not found: {file_path}")

    # Validate file size
    file_size = os.path.getsize(file_path)
    if file_size > _MAX_FILE_SIZE:
        return Result(ok=False, error=f"File too large: {file_size} bytes (max {_MAX_FILE_SIZE})")

    filename = os.path.basename(file_path)

    if ctx.is_mock:
        return _mock_upload(vm_id, filename, dst_path)

    if ctx.vm_backend is None:
        return Result(ok=False, error="VM backend not available")

    try:
        await ctx.vm_backend.upload(vm_id, file_path, dst_path)
        return Result(ok=True, data={"filename": filename, "dst_path": dst_path})
    except KeyError:
        return Result(ok=False, error=f"VM {vm_id} not found")
    except ValueError as e:
        return Result(ok=False, error=str(e))


def _mock_upload(vm_id: str, filename: str, dst_path: str) -> Result:
    # In mock mode, log the upload
    import structlog

    logger = structlog.get_logger(subsystem="vm")
    logger.info("vm_mock_upload", vm_id=vm_id, filename=filename, dst=dst_path)

    return Result(ok=True, data={
        "filename": filename,
        "dst_path": dst_path,
        "note": "Mac mock: file would be uploaded to VM in production",
    })
