"""ScreenOrientation protocol — abstract interface for screen rotation.

Mac mock: no-op + WS event
Linux: wlr-randr / xrandr (Linux stage)
"""

from __future__ import annotations

from typing import Literal, Protocol, runtime_checkable


@runtime_checkable
class ScreenOrientation(Protocol):
    """Async screen orientation control."""

    async def set(self, orientation: Literal["landscape", "portrait"]) -> None:
        """Set screen orientation."""
        ...

    async def get(self) -> str:
        """Get current orientation."""
        ...
