"""Mock ScreenOrientation — no-op + WS event.

Mac default. Pushes screen_changed event to WS publisher.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

import structlog

if TYPE_CHECKING:
    from app.ws.publisher import EventPublisher

logger = structlog.get_logger(subsystem="screen")


class MockScreenOrientation:
    """Mock screen orientation for Mac.

    Optionally integrates with EventPublisher for WS screen_changed events.
    """

    def __init__(self, publisher: EventPublisher | None = None) -> None:
        self._orientation: str = "landscape"
        self._publisher = publisher

    def set_publisher(self, publisher: EventPublisher) -> None:
        """Set the WS event publisher."""
        self._publisher = publisher

    async def set(self, orientation: Literal["landscape", "portrait"]) -> None:
        old = self._orientation
        self._orientation = orientation

        logger.info("screen_orientation_changed", old=old, new=orientation)

        # Push WS event
        if self._publisher:
            await self._publisher.screen_changed(orientation)
            logger.info("screen_changed_event_pushed", orientation=orientation)

    async def get(self) -> str:
        return self._orientation
