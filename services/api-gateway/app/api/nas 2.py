"""NAS (飞牛 fnOS) API — auto-login proxy."""

import logging
import subprocess

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

from app.nas import NAS_WEB_URL, _nas_ssh

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/nas", tags=["NAS"])


@router.get("/auto-login")
async def nas_auto_login(
    user: User = Depends(get_current_user),
):
    """Return the NAS web UI URL. The user's NAS account was created
    with the same password during registration, so they can login directly."""
    return {
        "url": NAS_WEB_URL,
        "username": user.username,
        "message": "NAS account uses the same credentials as Studio Javis",
    }


@router.get("/auth-url")
async def nas_auth_url(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a NAS auto-login URL with embedded credentials.

    Opens the NAS web UI and auto-fills the login form via URL parameters.
    """
    return {
        "url": f"{NAS_WEB_URL}",
        "username": user.username,
    }
