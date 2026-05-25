"""Internal HTTP endpoint: /internal/events/publish

Only accessible from localhost (127.0.0.1 or unix socket).
Used by perception service to push events to the WS hub.
"""

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.ws.hub import hub

logger = structlog.get_logger("internal-events")

router = APIRouter(prefix="/internal/events", tags=["Internal"])


class PublishRequest(BaseModel):
    user_id: str
    event: dict


class BroadcastRequest(BaseModel):
    event: dict


@router.post("/publish")
async def publish_event(body: PublishRequest, request: Request):
    """Push an event to a user's WebSocket connections.

    Security: only allow requests from localhost.
    Use user_id=\"*\" to broadcast to all connected users.
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="internal endpoint only")

    if body.user_id == "*":
        await hub.broadcast(body.event)
        logger.info("event_broadcast", event_type=body.event.get("type"))
    else:
        await hub.send_to_user(body.user_id, body.event)
        logger.info("event_published", user_id=body.user_id, event_type=body.event.get("type"))
    return {"ok": True}


@router.post("/broadcast")
async def broadcast_event(body: BroadcastRequest, request: Request):
    """Push an event to ALL connected WebSocket users.

    Security: only allow requests from localhost.
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="internal endpoint only")

    await hub.broadcast(body.event)
    logger.info("event_broadcast", event_type=body.event.get("type"))
    return {"ok": True}
