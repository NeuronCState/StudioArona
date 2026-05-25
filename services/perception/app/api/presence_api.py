"""Presence API — query current presence state."""

from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/presence", tags=["Presence"])


@router.get("/status")
async def get_presence_status(request: Request) -> dict:
    presence = request.app.state.presence
    return {"status": "ok", "state": presence.state.value}
