"""CameraSource protocol — abstract interface for camera hardware.

Mac: OpenCV VideoCapture(0) for FaceTime
Linux: V4L2 device path (Linux stage)
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray

# BGR frame from OpenCV
Frame = NDArray[np.uint8]


@runtime_checkable
class CameraSource(Protocol):
    """Async camera source protocol."""

    async def open(self, device: int | str = 0) -> None:
        """Open camera device. Raises CameraError on failure."""
        ...

    async def read(self) -> Frame:
        """Read one frame (BGR). Raises CameraError if no frame available."""
        ...

    async def close(self) -> None:
        """Release camera resources."""
        ...

    @property
    def fps(self) -> float:
        """Current FPS."""
        ...

    @property
    def resolution(self) -> tuple[int, int]:
        """(width, height)."""
        ...


class CameraError(Exception):
    """Camera operation failed."""
