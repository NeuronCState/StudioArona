"""Current user endpoints: GET /api/me, PATCH /api/me, PATCH /api/me/preferences."""

import json
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.session import get_db
from app.models.user import User, UserPreference

router = APIRouter(tags=["User"])


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ProfileUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None
    email: str | None = None  # optional notification email

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None  # allow clearing
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("invalid email format")
        return v


class PreferenceUpdate(BaseModel):
    key: str
    value: dict | list | str | int | float | bool


@router.get("/api/me")
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Load preferences
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    prefs = {p.key: json.loads(p.value_json) for p in result.scalars()}

    # Check face enrollment
    from sqlalchemy import func as sqlfunc

    from app.models.user import UserFaceEmbedding

    face_count = await db.execute(
        select(sqlfunc.count())
        .select_from(UserFaceEmbedding)
        .where(UserFaceEmbedding.user_id == user.id)
    )

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at.isoformat(),
        "preferences": prefs,
        "face_enrolled": face_count.scalar() > 0,
    }


@router.patch("/api/me")
async def update_me(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.username is not None:
        user.username = body.username
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.email is not None:
        # empty string → clear; non-empty → validate uniqueness
        if body.email == "":
            user.email = None
        else:
            clash = await db.execute(
                select(User).where(User.email == body.email, User.id != user.id)
            )
            if clash.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "JAVIS_EMAIL_TAKEN", "message": "邮箱已被使用"},
                )
            user.email = body.email
    await db.commit()
    await db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "role": user.role,
    }


@router.patch("/api/me/preferences")
async def update_preferences(
    body: PreferenceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == user.id,
            UserPreference.key == body.key,
        )
    )
    pref = result.scalar_one_or_none()

    if pref is None:
        pref = UserPreference(
            user_id=user.id,
            key=body.key,
            value_json=json.dumps(body.value),
        )
        db.add(pref)
    else:
        pref.value_json = json.dumps(body.value)

    await db.flush()

    # Return all preferences
    all_prefs = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    prefs = {p.key: json.loads(p.value_json) for p in all_prefs.scalars()}

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "role": user.role,
        "preferences": prefs,
    }
