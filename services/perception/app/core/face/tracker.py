"""Face tracker — first-order low-pass filter + P-control / Image Jacobian IBVS.

Two modes:
  1. Simple P-control (default, backward compatible)
  2. Image Jacobian IBVS (when visual_servo_controller is provided)

Pipeline:
  raw detection (center_x, center_y, area_ratio)
    → low-pass filter (α=0.6)
    → [P-control | Image Jacobian]
    → output: dx, dy, depth_mm (+ optional KMS command)

Anti-jitter: sliding window vote for wake/leave decisions.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import structlog

from app.core.face.detector import FaceDetection

if TYPE_CHECKING:
    from app.core.face.visual_servoing import ServoCommand, VisualServoController

logger = structlog.get_logger(subsystem="face")


@dataclass
class TrackState:
    """Current tracking state."""

    # Filtered position (normalized [0, 1])
    x: float = 0.5
    y: float = 0.5
    size: float = 0.0

    # Raw offsets for serial command
    dx: int = 0  # pixels offset from center (P-control) or mm (IBVS)
    dy: int = 0
    depth_mm: int = 0

    # KMS command from image Jacobian (empty string when not using IBVS)
    kms_command: str = ""

    # State
    tracking: bool = False
    lost_frames: int = 0
    present_frames: int = 0


@dataclass
class FaceTracker:
    """First-order low-pass filter + P-control (or Image Jacobian IBVS) for face tracking.

    Config (from 03 规划书 §6.1):
    - α = 0.6 (filter coefficient)
    - kp = 0.04 (P-control gain, used in simple mode only)
    - wake_threshold = 10 frames (~0.4s at 25fps)
    - leave_threshold = 30 frames (~1.2s at 25fps)

    Set visual_servo_controller to enable Image Jacobian IBVS mode.
    """

    alpha: float = 0.6
    kp: float = 0.04
    wake_threshold: int = 10
    leave_threshold: int = 30
    frame_width: int = 640
    frame_height: int = 480

    state: TrackState = field(default_factory=TrackState)

    # Image Jacobian IBVS (None = use simple P-control)
    visual_servo_controller: VisualServoController | None = None

    # Sliding window for anti-jitter
    _presence_window: deque[bool] = field(default_factory=lambda: deque(maxlen=40))

    def update(self, detection: FaceDetection | None) -> TrackState:
        """Update tracker with new detection (or None if no face found).

        Returns updated TrackState.
        """
        if detection is not None:
            self._presence_window.append(True)
            self._update_present(detection)
        else:
            self._presence_window.append(False)
            self._update_lost()

        return self.state

    def _update_present(self, det: FaceDetection) -> None:
        """Face detected — filter and compute offsets."""
        self.state.lost_frames = 0
        self.state.present_frames += 1

        # Low-pass filter
        s = self.state
        s.x = self.alpha * det.center_x + (1 - self.alpha) * s.x
        s.y = self.alpha * det.center_y + (1 - self.alpha) * s.y
        s.size = self.alpha * det.area_ratio + (1 - self.alpha) * s.size

        if self.visual_servo_controller is not None:
            self._update_ibvs(s)
        else:
            self._update_pcontrol(s)

        # Wake detection with sliding window vote
        if not s.tracking:
            recent_present = sum(
                1 for p in list(self._presence_window)[-self.wake_threshold :] if p
            )
            if recent_present >= self.wake_threshold * 0.8:
                s.tracking = True
                logger.info(
                    "wake_detected",
                    x=round(s.x, 3),
                    y=round(s.y, 3),
                    size=round(s.size, 4),
                )

    def _update_pcontrol(self, s: TrackState) -> None:
        """Simple P-control: offset from center (0.5, 0.5)."""
        error_x = s.x - 0.5
        error_y = s.y - 0.5

        s.dx = int(self.kp * error_x * self.frame_width * 100)
        s.dy = int(self.kp * error_y * self.frame_height * 100)

        if s.size > 0.01:
            s.depth_mm = max(300, min(3000, int(200 / s.size)))
        else:
            s.depth_mm = 2000

        s.kms_command = ""

    def _update_ibvs(self, s: TrackState) -> None:
        """Image Jacobian IBVS: pixel error → world coordinates → KMS command."""
        servo = self.visual_servo_controller

        center_u = s.x * self.frame_width
        center_v = s.y * self.frame_height

        cmd = servo.compute_command(
            center_u=center_u,
            center_v=center_v,
            face_size=s.size,
        )

        if cmd is not None and cmd.is_significant:
            s.dx = cmd.dx_mm
            s.dy = cmd.dy_mm
            s.depth_mm = cmd.dz_mm
            s.kms_command = cmd.kms_string
        else:
            s.dx = 0
            s.dy = 0
            s.depth_mm = 0
            s.kms_command = ""

    def _update_lost(self) -> None:
        """No face detected — increment lost counter."""
        self.state.present_frames = 0
        self.state.lost_frames += 1

        # Leave detection with sliding window vote
        if self.state.tracking:
            recent_absent = sum(
                1 for p in list(self._presence_window)[-self.leave_threshold:] if not p
            )
            if recent_absent >= self.leave_threshold * 0.8:
                self.state.tracking = False
                logger.info("leave_detected", lost_frames=self.state.lost_frames)

    def reset(self) -> None:
        """Reset tracker state."""
        self.state = TrackState()
        self._presence_window.clear()
        if self.visual_servo_controller is not None:
            self.visual_servo_controller.reset()
