"""Auth endpoints: login / refresh / logout."""

import re

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token, create_refresh_token, verify_refresh_token
from app.auth.password import hash_password, verify_password
from app.db.session import get_db
from app.memory.paths import get_user_dir
from app.memory.provisioner import ensure_user_memory_db
from app.middleware.csrf import CSRF_COOKIE_NAME, generate_csrf_token
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Invitation code is deprecated. Kept as a constant so any in-flight /register
# calls with the old body still get a 403 (loud) instead of silently going
# through. New clients should omit the field.
VALID_INVITATION_CODE = "arona"

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    username: str
    display_name: str
    password: str
    invitation_code: str | None = None  # deprecated, ignored if present
    email: str | None = None  # optional — used for email notifications

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("invalid email format")
        return v.lower()


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register", status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # If client still sends the old invitation_code, reject loudly so they fix it
    if body.invitation_code is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "JAVIS_INVITATION_REMOVED",
                    "message": "邀请码已废弃，注册请用可选的 email 字段"},
        )

    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "JAVIS_USER_EXISTS", "message": "用户名已存在"},
        )

    # If email provided, ensure uniqueness
    if body.email:
        existing_email = await db.execute(select(User).where(User.email == body.email))
        if existing_email.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "JAVIS_EMAIL_TAKEN", "message": "邮箱已被使用"},
            )

    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role="member",
        email=body.email,
    )
    db.add(user)
    await db.flush()

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

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at.isoformat(),
        },
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "JAVIS_AUTH_INVALID", "message": "用户名或密码错误"},
        )

    user.last_login_at = datetime.now(UTC)
    await db.flush()

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    csrf_token = generate_csrf_token()

    response = JSONResponse(
        content={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": {
                "id": user.id,
                "username": user.username,
                "display_name": user.display_name,
                "role": user.role,
                "created_at": user.created_at.isoformat(),
            },
        }
    )
    # Set CSRF cookie (readable by JS, not HttpOnly)
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        samesite="strict",
        max_age=3600,
    )
    return response


@router.post("/refresh")
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = verify_refresh_token(body.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "JAVIS_AUTH_EXPIRED", "message": "刷新令牌无效或已过期"},
        )

    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "JAVIS_USER_NOT_FOUND", "message": "用户不存在"},
        )

    new_access = create_access_token(user.id, user.role)
    return {"access_token": new_access}


@router.post("/logout", status_code=204)
async def logout():
    # TODO: add refresh token to Redis blacklist (W2)
    return None
