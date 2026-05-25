"""Linux CameraSource implementation — V4L2 via OpenCV.

Placeholder for Linux stage. Will use /dev/videoN device paths.
"""

from __future__ import annotations

from app.core.camera.base import CameraError, Frame


class LinuxCameraSource:
    """V4L2 camera for Linux. Not yet implemented."""

    async def open(self, device: int | str = 0) -> None:
        raise NotImplementedError("Linux camera: V4L2 implementation pending Linux stage")

    async def read(self) -> Frame:
        raise NotImplementedError("Linux camera: V4L2 implementation pending Linux stage")

    async def close(self) -> None:
        pass

    @property
    def fps(self) -> float:
        return 0.0

    @property
    def resolution(self) -> tuple[int, int]:
        return (0, 0)
