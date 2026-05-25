"""WebSocket event bus hub.

Browser connects to /ws/events with JWT.
Perception pushes events via internal HTTP /internal/events/publish.
Hub fans out events to the target user's connections.
"""

import asyncio
import json
from dataclasses import dataclass

import structlog
from fastapi import WebSocket

logger = structlog.get_logger("ws-hub")


@dataclass(eq=False)
class Connection:
    ws: WebSocket
    user_id: str


class WSHub:
    """Manages WebSocket connections, fan-out by user_id."""

    def __init__(self):
        # user_id → set of Connection
        self._connections: dict[str, set[Connection]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, user_id: str):
        await ws.accept()
        conn = Connection(ws=ws, user_id=user_id)
        async with self._lock:
            if user_id not in self._connections:
                self._connections[user_id] = set()
            self._connections[user_id].add(conn)
        logger.info("ws_connected", user_id=user_id, total=self._count())

    async def disconnect(self, ws: WebSocket, user_id: str):
        async with self._lock:
            conns = self._connections.get(user_id, set())
            to_remove = {c for c in conns if c.ws is ws}
            conns -= to_remove
            if not conns:
                self._connections.pop(user_id, None)
        logger.info("ws_disconnected", user_id=user_id, total=self._count())

    async def send_to_user(self, user_id: str, event: dict):
        """Send event to all connections of a specific user."""
        async with self._lock:
            conns = self._connections.get(user_id, set()).copy()

        if not conns:
            logger.debug("ws_no_recipients", user_id=user_id)
            return

        data = json.dumps(event)
        dead: list[Connection] = []
        for conn in conns:
            try:
                await conn.ws.send_text(data)
            except Exception:
                dead.append(conn)

        # Cleanup dead connections
        if dead:
            async with self._lock:
                conns = self._connections.get(user_id, set())
                for d in dead:
                    conns.discard(d)
                if not conns:
                    self._connections.pop(user_id, None)

    async def broadcast(self, event: dict):
        """Send event to ALL connected users."""
        async with self._lock:
            all_users = list(self._connections.keys())

        for user_id in all_users:
            await self.send_to_user(user_id, event)

    def _count(self) -> int:
        return sum(len(c) for c in self._connections.values())


# Singleton instance
hub = WSHub()
