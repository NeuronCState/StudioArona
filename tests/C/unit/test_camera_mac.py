"""Unit tests for MacCameraSource.

Tests camera open/close lifecycle. Frame read requires real camera (skipped in CI).
"""

from __future__ import annotations

import pytest

from app.core.camera.base import CameraError
from app.core.camera.mac import MacCameraSource


@pytest.fixture
def camera():
    return MacCameraSource()


@pytest.mark.asyncio
async def test_camera_not_opened(camera):
    with pytest.raises(CameraError, match="not opened"):
        await camera.read()


@pytest.mark.asyncio
async def test_camera_properties_default(camera):
    assert camera.fps == 0.0
    assert camera.resolution == (0, 0)


@pytest.mark.asyncio
async def test_camera_close_without_open(camera):
    # Should not raise
    await camera.close()


@pytest.mark.asyncio
async def test_camera_open_invalid_device(camera):
    with pytest.raises(CameraError):
        await camera.open(999)
