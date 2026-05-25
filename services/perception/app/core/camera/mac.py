"""Mac CameraSource implementation using OpenCV.

Uses FaceTime camera (device 0) via cv2.VideoCapture.
First access may trigger macOS permission dialog.
"""

from __future__ import annotations

import asyncio
import time

import cv2
import numpy as np
import structlog

from app.core.camera.base import CameraError, Frame

logger = structlog.get_logger(subsystem="camera")


class MacCameraSource:
    """OpenCV-based camera for macOS."""

    def __init__(self) -> None:
        self._cap: cv2.VideoCapture | None = None
        self._device: int | str = 0
        self._fps: float = 0.0
        self._width: int = 0
        self._height: int = 0
        self._frame_count: int = 0
        self._start_time: float = 0.0

    async def open(self, device: int | str = 0) -> None:
        self._device = device
        cap = await asyncio.to_thread(cv2.VideoCapture, int(device))
        if not cap.isOpened():
            raise CameraError(f"Cannot open camera device {device}. Check macOS permissions.")

        self._width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._cap = cap
        self._frame_count = 0
        self._start_time = time.monotonic()

        logger.info(
            "camera_opened",
            device=device,
            resolution=f"{self._width}x{self._height}",
        )

    async def read(self) -> Frame:
        if self._cap is None:
            raise CameraError("Camera not opened. Call open() first.")

        ret, frame = await asyncio.to_thread(self._cap.read)
        if not ret or frame is None:
            raise CameraError("Failed to read frame from camera.")

        self._frame_count += 1
        elapsed = time.monotonic() - self._start_time
        if elapsed > 0:
            self._fps = self._frame_count / elapsed

        return frame

    async def close(self) -> None:
        if self._cap is not None:
            await asyncio.to_thread(self._cap.release)
            self._cap = None
            logger.info("camera_closed", device=self._device)

    @property
    def fps(self) -> float:
        return self._fps

    @property
    def resolution(self) -> tuple[int, int]:
        return (self._width, self._height)
