"""Linux ScreenOrientation — wlr-randr / xrandr.

Placeholder for Linux stage.
"""

from __future__ import annotations

from typing import Literal


class LinuxScreenOrientation:
    """Real screen rotation via wlr-randr. Not yet implemented."""

    async def set(self, orientation: Literal["landscape", "portrait"]) -> None:
        raise NotImplementedError("Linux screen: wlr-randr implementation pending Linux stage")

    async def get(self) -> str:
        raise NotImplementedError("Linux screen: wlr-randr implementation pending Linux stage")
