"""WebSocket route: /ws/events

Client connects with JWT token in query param or first message.
"""

import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth.jwt import verify_access_token
from app.ws.hub import hub

router = APIRouter()


@router.websocket("/ws/events")
async def ws_events(
    ws: WebSocket,
    token: str = Query(default=""),
):
    """WebSocket event bus endpoint.

    Auth: pass JWT as ?token=<access_token>
    """
    # Authenticate
    payload = verify_access_token(token)
    if payload is None:
        await ws.close(code=4001, reason="invalid token")
        return

    user_id = payload["sub"]
    await hub.connect(ws, user_id)

    try:
        while True:
            # Keep connection alive; client may send pings or commands
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                # Handle client → server commands (e.g., tracking toggle)
                await _handle_client_message(user_id, msg)
            except json.JSONDecodeError:
                pass  # ignore malformed messages
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(ws, user_id)


async def _handle_client_message(user_id: str, msg: dict):
    """Handle client → server WebSocket messages."""
    msg_type = msg.get("type")

    if msg_type == "ping":
        # Respond with pong
        await hub.send_to_user(user_id, {"type": "pong"})

    # Other message types (rotate_screen, tracking) are forwarded
    # to perception via internal HTTP — handled by /internal/events/publish
