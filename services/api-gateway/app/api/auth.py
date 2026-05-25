"""Auth endpoints: login / refresh / logout."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
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


VALID_INVITATION_CODE = "arona"


class RegisterRequest(BaseModel):
    username: str
    display_name: str
    password: str
    invitation_code: str


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
    if body.invitation_code != VALID_INVITATION_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "JAVIS_INVALID_INVITATION", "message": "识别码无效"},
        )

    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "JAVIS_USER_EXISTS", "message": "用户名已存在"},
        )

    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role="member",
        invitation_code=body.invitation_code,
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
