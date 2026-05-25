"""Unit tests for FaceTracker — low-pass filter + P-control.

Verifies:
- Filter smoothing (trajectory L2 norm of derivative < threshold)
- Wake detection (10 consecutive frames)
- Leave detection (30 consecutive frames)
- Anti-jitter (sliding window vote)
"""

from __future__ import annotations

import math

import pytest

from app.core.face.detector import FaceDetection
from app.core.face.tracker import FaceTracker


def _make_detection(cx: float, cy: float, size: float = 0.1) -> FaceDetection:
    return FaceDetection(
        x=200, y=150, w=100, h=100,
        confidence=0.9,
        center_x=cx, center_y=cy,
        area_ratio=size,
    )


@pytest.fixture
def tracker():
    return FaceTracker(alpha=0.6, kp=0.04, wake_threshold=10, leave_threshold=30)


def test_initial_state_not_tracking(tracker):
    assert tracker.state.tracking is False
    assert tracker.state.present_frames == 0
    assert tracker.state.lost_frames == 0


def test_smoothing_reduces_noise(tracker):
    """Feed noisy trajectory, verify filtered output is smoother."""
    # Simulate noisy detection around center
    import random
    random.seed(42)

    raw_xs = []
    filtered_xs = []

    for _ in range(50):
        cx = 0.5 + random.uniform(-0.1, 0.1)
        det = _make_detection(cx, 0.5)
        tracker.update(det)
        raw_xs.append(cx)
        filtered_xs.append(tracker.state.x)

    # Compute L2 norm of derivatives
    def derivative_l2(values):
        diffs = [abs(values[i+1] - values[i]) for i in range(len(values)-1)]
        return math.sqrt(sum(d*d for d in diffs))

    raw_l2 = derivative_l2(raw_xs)
    filtered_l2 = derivative_l2(filtered_xs)

    # Filtered should be significantly smoother
    assert filtered_l2 < raw_l2 * 0.7


def test_wake_after_threshold(tracker):
    """Wake should trigger after 10 consecutive detections (with 80% vote)."""
    for i in range(12):
        state = tracker.update(_make_detection(0.5, 0.5))

    assert state.tracking is True
    assert state.present_frames >= 10


def test_leave_after_threshold(tracker):
    """Leave should trigger after 30 consecutive misses."""
    # First, trigger wake
    for _ in range(12):
        tracker.update(_make_detection(0.5, 0.5))
    assert tracker.state.tracking is True

    # Now lose the face
    for i in range(35):
        state = tracker.update(None)

    assert state.tracking is False


def test_no_wake_on_intermittent(tracker):
    """Intermittent detections should not trigger wake."""
    for i in range(20):
        if i % 3 == 0:
            tracker.update(_make_detection(0.5, 0.5))
        else:
            tracker.update(None)

    assert tracker.state.tracking is False


def test_offset_calculation(tracker):
    """Face off-center should produce non-zero dx/dy."""
    # Feed enough frames to stabilize filter
    for _ in range(5):
        tracker.update(_make_detection(0.7, 0.3))  # right-top

    assert tracker.state.dx != 0
    assert tracker.state.dy != 0


def test_depth_estimation(tracker):
    """Larger face should produce smaller depth."""
    tracker.update(_make_detection(0.5, 0.5, size=0.3))
    depth_large = tracker.state.depth_mm

    tracker.reset()
    tracker.update(_make_detection(0.5, 0.5, size=0.05))
    depth_small = tracker.state.depth_mm

    assert depth_large < depth_small


def test_reset(tracker):
    """Reset should clear all state."""
    for _ in range(15):
        tracker.update(_make_detection(0.5, 0.5))
    assert tracker.state.tracking is True

    tracker.reset()
    assert tracker.state.tracking is False
    assert tracker.state.present_frames == 0
