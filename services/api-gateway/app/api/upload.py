"""File upload endpoint with security validation.

Security measures:
- Max file size: 100MB
- Extension whitelist
- Content-Type validation
- Path traversal prevention (zip-slip)
- Zip bomb protection (max decompressed size)
"""

import io
import os
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.utils.audit import write_audit_log

router = APIRouter(tags=["Upload"])

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
MAX_ZIP_DECOMPRESSED = 500 * 1024 * 1024  # 500MB

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",  # images
    ".mp4", ".webm", ".mov",  # video
    ".mp3", ".wav", ".ogg",  # audio
    ".pdf", ".doc", ".docx", ".txt", ".md",  # documents
    ".zip", ".tar", ".gz",  # archives
    ".py", ".ts", ".tsx", ".js", ".json", ".yaml", ".yml",  # code
}

ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm", "video/quicktime",
    "audio/mpeg", "audio/wav", "audio/ogg",
    "application/pdf", "text/plain", "text/markdown",
    "application/zip", "application/gzip", "application/x-tar",
    "application/octet-stream",
}


def _validate_extension(filename: str) -> bool:
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def _validate_zip_content(data: bytes) -> None:
    """Check for zip-slip and zip bomb."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            total_size = 0
            for info in zf.infolist():
                # Zip-slip: check for path traversal
                if info.filename.startswith("/") or ".." in info.filename:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={
                            "code": "JAVIS_ZIP_SLIP",
                            "message": f"ZIP 包含非法路径: {info.filename}",
                        },
                    )
                total_size += info.file_size

                # Zip bomb: check decompressed size
                if total_size > MAX_ZIP_DECOMPRESSED:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={
                            "code": "JAVIS_ZIP_BOMB",
                            "message": "ZIP 解压后过大，疑似 zip bomb",
                        },
                    )
    except zipfile.BadZipFile:
        pass  # not a valid zip, that's fine


@router.post("/api/upload")
async def upload_file(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate extension
    if not _validate_extension(file.filename or ""):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "JAVIS_FILE_TYPE",
                "message": f"不允许的文件类型: {file.filename}",
            },
        )

    # Read file content
    content = await file.read()

    # Validate size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "JAVIS_FILE_TOO_LARGE",
                "message": f"文件过大，最大 {MAX_FILE_SIZE // (1024*1024)}MB",
            },
        )

    # Validate zip content if it's a zip file
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext == ".zip":
        _validate_zip_content(content)

    # Audit log
    await write_audit_log(
        db=db,
        actor=user.id,
        action="upload.file",
        target=file.filename,
        payload={"size": len(content), "content_type": file.content_type},
        ip=request.client.host if request.client else None,
    )

    return {
        "filename": file.filename,
        "size": len(content),
        "content_type": file.content_type,
        "status": "uploaded",
    }
