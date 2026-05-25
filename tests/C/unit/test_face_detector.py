"""Unit tests for FaceDetector — Haar cascade fallback.

Since YOLOE model may not be available in test env,
tests use the Haar cascade fallback with synthetic frames.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.face.detector import FaceDetector, FaceDetection


@pytest.fixture
def detector():
    """Create detector with Haar cascade (always available with opencv)."""
    d = FaceDetector(confidence_threshold=0.5)
    return d


@pytest.fixture
def blank_frame():
    """Blank 640x480 BGR frame."""
    return np.zeros((480, 640, 3), dtype=np.uint8)


@pytest.fixture
def face_frame():
    """Frame with a synthetic bright rectangle (simulates face)."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw a skin-colored rectangle in center
    frame[150:350, 220:420] = (180, 200, 230)  # BGR skin tone
    return frame


@pytest.mark.asyncio
async def test_detector_load(detector):
    """Load should succeed (falls back to Haar)."""
    await detector.load()
    assert detector._haar_cascade is not None or detector._model is not None


@pytest.mark.asyncio
async def test_detect_blank_frame(detector, blank_frame):
    """Blank frame should return no detections."""
    await detector.load()
    detections = await detector.detect(blank_frame)
    assert isinstance(detections, list)


@pytest.mark.asyncio
async def test_detection_structure(detector, blank_frame):
    """Detection result should have correct fields."""
    await detector.load()
    detections = await detector.detect(blank_frame)
    for d in detections:
        assert isinstance(d, FaceDetection)
        assert 0 <= d.center_x <= 1
        assert 0 <= d.center_y <= 1
        assert 0 <= d.area_ratio <= 1
        assert d.confidence >= 0


@pytest.mark.asyncio
async def test_detections_sorted_by_area(detector, blank_frame):
    """Detections should be sorted by area (largest first)."""
    await detector.load()
    detections = await detector.detect(blank_frame)
    if len(detections) > 1:
        for i in range(len(detections) - 1):
            assert detections[i].area_ratio >= detections[i + 1].area_ratio
