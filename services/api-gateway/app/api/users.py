"""Admin-only user management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.auth.password import hash_password
from app.db.session import get_db
from app.memory.paths import get_user_dir
from app.memory.provisioner import ensure_user_memory_db
from app.models.user import User
from app.utils.audit import write_audit_log

router = APIRouter(tags=["User"])


class CreateUserRequest(BaseModel):
    username: str
    display_name: str
    password: str
    role: str = "member"


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    role: str | None = None
    password: str | None = None


@router.get("/api/users")
async def list_users(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "role": u.role,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.post("/api/users", status_code=201)
async def create_user(
    body: CreateUserRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "JAVIS_USER_EXISTS", "message": "用户名已存在"},
        )

    if body.role not in ("admin", "member"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "JAVIS_INVALID_ROLE", "message": "角色必须是 admin 或 member"},
        )

    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.flush()

    # Provision per-user SQLite memory database
    try:
        db_path = ensure_user_memory_db(user.id)
        user.memory_db_path = str(db_path)
        await db.flush()
    except Exception as exc:
        await db.rollback()
        import shutil
        user_dir = get_user_dir(user.id)
        if user_dir.exists():
            shutil.rmtree(str(user_dir), ignore_errors=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "JAVIS_MEMORY_PROVISION_FAILED", "message": "用户记忆库创建失败"},
        ) from exc

    await write_audit_log(
        db=db,
        actor=admin.id,
        action="user.create",
        target=user.id,
        payload={"username": body.username, "role": body.role},
        ip=request.client.host if request.client else None,
    )

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "created_at": user.created_at.isoformat(),
    }


@router.patch("/api/users/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JAVIS_USER_NOT_FOUND", "message": "用户不存在"},
        )

    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        if body.role not in ("admin", "member"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "JAVIS_INVALID_ROLE", "message": "角色必须是 admin 或 member"},
            )
        user.role = body.role
    if body.password is not None:
        user.password_hash = hash_password(body.password)

    await db.flush()

    await write_audit_log(
        db=db,
        actor=admin.id,
        action="user.update",
        target=user_id,
        payload=body.model_dump(exclude_none=True),
        ip=request.client.host if request.client else None,
    )

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "created_at": user.created_at.isoformat(),
    }
