"""WS event publisher — pushes events to D's api-gateway event bus.

Events: wake, leave, face_track, metrics_update, screen_changed
- Targeted events (with user_id) → POST /internal/events/publish
- Broadcast events (no user_id) → POST /internal/events/broadcast
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

logger = structlog.get_logger(subsystem="ws")


class EventPublisher:
    """Publishes perception events to D's api-gateway via internal HTTP."""

    def __init__(self, gateway_url: str = "http://localhost:8080") -> None:
        self._gateway_url = gateway_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None
        self._connected = False

    async def connect(self) -> None:
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(5.0))
        self._connected = True
        logger.info("publisher_connected", gateway=self._gateway_url)

    async def disconnect(self) -> None:
        self._connected = False
        if self._client:
            await self._client.aclose()
            self._client = None
        logger.info("publisher_disconnected")

    async def publish(self, event: dict[str, Any]) -> None:
        """Publish an event to D's event bus."""
        if not self._client:
            logger.warning("publisher_not_connected", event_type=event.get("type"))
            return

        event_type = event.get("type", "unknown")

        try:
            resp = await self._client.post(
                f"{self._gateway_url}/internal/events/broadcast",
                json={"event": event},
            )
            if resp.status_code == 200:
                logger.debug("event_published", event_type=event_type)
            else:
                logger.warning(
                    "event_publish_failed",
                    event_type=event_type,
                    status=resp.status_code,
                    body=resp.text[:200],
                )
        except Exception as e:
            logger.warning("event_publish_error", event_type=event_type, error=str(e))

    async def publish_to_user(self, user_id: str, event: dict[str, Any]) -> None:
        """Publish a targeted event to a specific user."""
        if not self._client:
            logger.warning("publisher_not_connected", event_type=event.get("type"))
            return

        event_type = event.get("type", "unknown")

        try:
            resp = await self._client.post(
                f"{self._gateway_url}/internal/events/publish",
                json={"user_id": user_id, "event": event},
            )
            if resp.status_code == 200:
                logger.debug("event_published_to_user", user_id=user_id, event_type=event_type)
            else:
                logger.warning(
                    "event_publish_failed",
                    user_id=user_id,
                    event_type=event_type,
                    status=resp.status_code,
                    body=resp.text[:200],
                )
        except Exception as e:
            logger.warning("event_publish_error", user_id=user_id, event_type=event_type, error=str(e))

    async def wake(self, user_id: str, confidence: float) -> None:
        await self.publish_to_user(
            user_id, {"type": "wake", "user_id": user_id, "confidence": confidence}
        )

    async def leave(self, duration_ms: int = 0) -> None:
        await self.publish({"type": "leave", "duration_ms": duration_ms})

    async def face_track(self, x: float, y: float, size: float) -> None:
        await self.publish({"type": "face_track", "x": x, "y": y, "size": size})

    async def metrics_update(self, payload: dict[str, Any]) -> None:
        await self.publish({"type": "metrics_update", "payload": payload})

    async def screen_changed(self, orientation: str) -> None:
        await self.publish({"type": "screen_changed", "orientation": orientation})
