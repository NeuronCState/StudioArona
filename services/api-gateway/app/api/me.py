"""Current user endpoints: GET /api/me, PATCH /api/me, PATCH /api/me/preferences."""

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.session import get_db
from app.models.user import User, UserPreference

router = APIRouter(tags=["User"])


class ProfileUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None


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
    await db.commit()
    await db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
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
        "role": user.role,
        "preferences": prefs,
    }
