"""Image Jacobian visual servoing (IBVS) for face tracking.

Uses YOLO26s-seg face detection → image Jacobian (reduced 2×3 interaction matrix)
→ world-coordinate servo commands ($KMS for robotic arm).

Math foundation:
  Pinhole camera: u = fx * X/Z + cx,  v = fy * Y/Z + cy
  Camera motion convention: dX/dt = -vx (camera moves right = point moves left)
  Interaction matrix L_s (translation-only, 2×3):
    L_s = [ -fx/Z     0      (u-cx)/Z ]
          [   0      -fy/Z   (v-cy)/Z ]
  Control law: v_cam = -λ * L_s^+ * e   where e = [u-u*, v-v*]^T
  Depth: estimated from face bounding-box area via inverse-square law.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import structlog

logger = structlog.get_logger(subsystem="visual_servo")


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class CameraIntrinsics:
    """Pinhole camera intrinsic parameters.

    Defaults are reasonable for a 640×480 webcam (Logitech C920 typical).
    """

    width: int = 640
    height: int = 480
    fx: float = 600.0  # focal length x (pixels)
    fy: float = 600.0  # focal length y (pixels)
    cx: float = 320.0  # principal point x
    cy: float = 240.0  # principal point y

    @property
    def frame_area(self) -> int:
        return self.width * self.height


@dataclass
class ServoCommand:
    """Output of visual servo controller — ready to send to the robotic arm."""

    dx_mm: int = 0
    dy_mm: int = 0
    dz_mm: int = 0
    target_x: int = 0  # absolute X in mm (accumulated)
    target_y: int = 0  # absolute Y in mm
    target_z: int = 0  # absolute Z in mm
    kms_time_ms: int = 500  # movement time for $KMS

    @property
    def kms_string(self) -> str:
        """Format as $KMS:x,y,z,time! per interface doc §2.10."""
        return f"$KMS:{self.target_x},{self.target_y},{self.target_z},{self.kms_time_ms}!"

    @property
    def is_significant(self) -> bool:
        """Whether the command is large enough to send."""
        return abs(self.dx_mm) >= 1 or abs(self.dy_mm) >= 1 or abs(self.dz_mm) >= 1


# ---------------------------------------------------------------------------
# Image Jacobian
# ---------------------------------------------------------------------------


class ImageJacobian:
    """Reduced 2×3 image interaction matrix for translation-only IBVS.

    Maps camera spatial velocity [vx, vy, vz]^T to image feature velocity [u̇, v̇]^T.
    """

    def __init__(self, intrinsics: CameraIntrinsics) -> None:
        self.K = intrinsics

    def compute(self, u: float, v: float, Z: float) -> np.ndarray:
        """Compute the 2×3 interaction matrix L_s at image point (u, v) with depth Z.

        Derivation (standard IBVS, translation-only, pixel coordinates):
          u = fx * X/Z + cx  →  u̇ = fx * Ẋ/Z - fx*X*Ż/Z² = fx*Ẋ/Z - (u-cx)*Ż/Z
          Since dX/dt = -Ẋ (camera moving right = point moves left relative to camera):
          u̇ = -(fx/Z) * Ẋ + (u-cx)/Z * Ż

        Args:
            u: feature x in pixels
            v: feature y in pixels
            Z: estimated depth in mm

        Returns:
            L_s: shape (2, 3), maps [vx, vy, vz]^T → [u̇, v̇]^T
        """
        fx, fy = self.K.fx, self.K.fy
        cx, cy = self.K.cx, self.K.cy

        if Z <= 0:
            raise ValueError(f"Depth Z must be positive, got {Z}")

        u_norm = u - cx
        v_norm = v - cy

        L = np.array(
            [
                [-fx / Z, 0.0, u_norm / Z],
                [0.0, -fy / Z, v_norm / Z],
            ],
            dtype=np.float64,
        )
        return L

    @staticmethod
    def pseudo_inverse(L: np.ndarray) -> np.ndarray:
        """Moore-Penrose pseudo-inverse of the 2×3 interaction matrix.

        Args:
            L: shape (2, 3) interaction matrix

        Returns:
            L^+: shape (3, 2)
        """
        # L^+ = L^T (L L^T)^-1
        LLt = L @ L.T  # shape (2, 2)
        try:
            LLt_inv = np.linalg.inv(LLt)
        except np.linalg.LinAlgError:
            # Fallback: regularised inverse
            LLt_inv = np.linalg.inv(LLt + np.eye(2) * 1e-6)
        return L.T @ LLt_inv  # shape (3, 2)

    def error_to_velocity(
        self, du: float, dv: float, u: float, v: float, Z: float
    ) -> np.ndarray:
        """Full pipeline: pixel errors → world velocity.

        Args:
            du: horizontal pixel error (desired - current)
            dv: vertical pixel error (desired - current)
            u:  current feature x in pixels
            v:  current feature y in pixels
            Z:  estimated depth in mm

        Returns:
            v_world: shape (3,) — [vx, vy, vz] in mm/frame
        """
        L = self.compute(u, v, Z)
        L_plus = self.pseudo_inverse(L)
        error = np.array([du, dv], dtype=np.float64)
        return L_plus @ error  # shape (3,)


# ---------------------------------------------------------------------------
# Depth estimator
# ---------------------------------------------------------------------------


def estimate_depth_from_face_size(
    face_area_ratio: float,
    frame_area: int = 640 * 480,
    calibration_const: float = 50000.0,
    min_depth: float = 100.0,
    max_depth: float = 3000.0,
) -> float:
    """Estimate depth from face bounding-box area using inverse-square law.

    Derivation:
      Real face area ≈ 400 cm² (0.04 m²)
      Image area = real_area * fx * fy / Z²
      → face_area_ratio = (real_area * fx * fy) / (Z² * frame_area)
      → Z = sqrt(real_area * fx * fy / (face_area_ratio * frame_area))
      → Z ≈ sqrt(calibration_const / face_area_ratio)

    calibration_const is empirically tuned for a typical webcam + adult face.
    """
    if face_area_ratio <= 0.0001:
        return max_depth

    Z = math.sqrt(calibration_const / face_area_ratio)
    return float(np.clip(Z, min_depth, max_depth))


# ---------------------------------------------------------------------------
# Visual servo controller
# ---------------------------------------------------------------------------


@dataclass
class VisualServoController:
    """IBVS controller: face detection → Jacobian → KMS command.

    Replaces the simple P-control in FaceTracker with a proper image Jacobian.
    Accumulates absolute position for $KMS absolute-coordinate commands.
    """

    intrinsics: CameraIntrinsics = field(default_factory=CameraIntrinsics)

    # Gains
    lambda_trans: float = 0.3  # proportional gain for translation
    lambda_depth: float = 0.5  # gain for depth correction (face size)

    # Target / desired state
    target_face_size: float = 0.08  # desired face area ratio (~8% of frame)

    # Limits
    dead_zone_px: float = 10.0  # pixel dead zone — don't move if error < this
    max_delta_mm: float = 50.0  # max position delta per frame
    min_depth_mm: float = 100.0
    max_depth_mm: float = 3000.0

    # Calibration
    depth_calibration_const: float = 50000.0

    # Workspace limits (from interface doc §5.3)
    workspace_y_min: float = 100.0
    workspace_y_max: float = 302.0
    workspace_z_min: float = 0.0
    workspace_z_max: float = 230.0
    workspace_x_max: float = 200.0  # ±

    # Internal state — accumulated absolute position in mm
    current_x: float = 100.0  # start at a reasonable default pose
    current_y: float = 180.0
    current_z: float = 100.0

    # Smoothing
    _alpha: float = 0.6  # exponential smoothing for velocity
    _vx_smooth: float = 0.0
    _vy_smooth: float = 0.0
    _vz_smooth: float = 0.0

    def compute_command(
        self,
        center_u: float,
        center_v: float,
        face_size: float,
        dt: float = 1.0 / 15.0,
    ) -> ServoCommand | None:
        """Compute a servo command from face detection.

        Args:
            center_u: face center x in pixels
            center_v: face center y in pixels
            face_size: face bounding-box area ratio [0, 1]
            dt: time delta since last frame in seconds

        Returns:
            ServoCommand or None if within dead zone
        """
        cx, cy = self.intrinsics.cx, self.intrinsics.cy

        # Pixel errors from image center (the desired position)
        du = center_u - cx
        dv = center_v - cy

        # Estimate depth from face size
        Z = estimate_depth_from_face_size(
            face_size,
            frame_area=self.intrinsics.frame_area,
            calibration_const=self.depth_calibration_const,
            min_depth=self.min_depth_mm,
            max_depth=self.max_depth_mm,
        )

        # Compute world velocity via image Jacobian
        jacobian = ImageJacobian(self.intrinsics)
        v_raw = jacobian.error_to_velocity(du, dv, center_u, center_v, Z)

        # Apply translational gain (with dead zone on pixel error)
        vx = -self.lambda_trans * v_raw[0] if abs(du) > self.dead_zone_px else 0.0
        vy = -self.lambda_trans * v_raw[1] if abs(dv) > self.dead_zone_px else 0.0

        # Depth control from face size error (no dead zone — always correct depth)
        size_error = face_size - self.target_face_size
        vz = -self.lambda_depth * size_error * Z

        # Exponential smoothing
        self._vx_smooth = self._alpha * vx + (1 - self._alpha) * self._vx_smooth
        self._vy_smooth = self._alpha * vy + (1 - self._alpha) * self._vy_smooth
        self._vz_smooth = self._alpha * vz + (1 - self._alpha) * self._vz_smooth

        # Clamp per-frame delta (velocity in mm/s, dt in seconds → mm/frame)
        dx_mm = int(np.clip(self._vx_smooth * dt, -self.max_delta_mm, self.max_delta_mm))
        dy_mm = int(np.clip(self._vy_smooth * dt, -self.max_delta_mm, self.max_delta_mm))
        dz_mm = int(np.clip(self._vz_smooth * dt, -self.max_delta_mm, self.max_delta_mm))

        # Return None only when nothing to do (all deltas zero or negligible)
        if dx_mm == 0 and dy_mm == 0 and dz_mm == 0:
            return None

        # Update absolute position with workspace clamping
        self.current_x = float(
            np.clip(self.current_x + dx_mm, -self.workspace_x_max, self.workspace_x_max)
        )
        self.current_y = float(
            np.clip(self.current_y + dy_mm, self.workspace_y_min, self.workspace_y_max)
        )
        self.current_z = float(
            np.clip(self.current_z + dz_mm, self.workspace_z_min, self.workspace_z_max)
        )

        return ServoCommand(
            dx_mm=dx_mm,
            dy_mm=dy_mm,
            dz_mm=dz_mm,
            target_x=int(self.current_x),
            target_y=int(self.current_y),
            target_z=int(self.current_z),
        )

    def reset(self) -> None:
        """Reset position state and smoothing."""
        self.current_x = 100.0
        self.current_y = 180.0
        self.current_z = 100.0
        self._vx_smooth = 0.0
        self._vy_smooth = 0.0
        self._vz_smooth = 0.0

    def recenter(self, x: float, y: float, z: float) -> None:
        """Manually set the current position estimate."""
        self.current_x = x
        self.current_y = y
        self.current_z = z


# ---------------------------------------------------------------------------
# YOLO segmentation mask helper
# ---------------------------------------------------------------------------


def mask_centroid(mask: np.ndarray) -> tuple[float, float] | None:
    """Compute centroid from a YOLO segmentation mask.

    More precise than bounding-box center for Jacobian computation.

    Args:
        mask: binary mask (H, W) or (1, H, W) from YOLO .masks.data

    Returns:
        (cx, cy) in pixel coordinates, or None if mask is empty
    """
    if mask.ndim == 3:
        mask = mask[0]  # take first channel

    ys, xs = np.where(mask > 0.5)
    if len(xs) == 0:
        return None

    return float(np.mean(xs)), float(np.mean(ys))


# ---------------------------------------------------------------------------
# Diagnostic / debug
# ---------------------------------------------------------------------------


def simulate_jacobian() -> None:
    """Print the Jacobian matrix at sample points for verification.

    Usage: python -c "from app.core.face.visual_servoing import simulate_jacobian; simulate_jacobian()"
    """
    intrinsics = CameraIntrinsics()
    jac = ImageJacobian(intrinsics)

    test_points = [
        # (u, v, Z, description)
        (320, 240, 1000, "face at center, 1m"),
        (400, 240, 1000, "face offset right, 1m"),
        (320, 300, 1000, "face offset down, 1m"),
        (320, 240, 500, "face at center, 0.5m"),
        (320, 240, 2000, "face at center, 2m"),
        (400, 300, 1000, "face offset bottom-right, 1m"),
    ]

    print("=" * 72)
    print("Image Jacobian Diagnostic")
    print("=" * 72)
    print(f"Camera: {intrinsics.width}×{intrinsics.height}")
    print(f"Intrinsics: fx={intrinsics.fx}, fy={intrinsics.fy}, cx={intrinsics.cx}, cy={intrinsics.cy}")
    print()

    for u, v, Z, desc in test_points:
        L = jac.compute(u, v, Z)
        L_plus = jac.pseudo_inverse(L)

        print(f"--- {desc} ---")
        print(f"  u={u:.0f}, v={v:.0f}, Z={Z:.0f}mm")
        print(f"  L (2×3):\n    {np.array2string(L, precision=4, suppress_small=True)}")
        print(f"  L^+ (3×2):\n    {np.array2string(L_plus, precision=4, suppress_small=True)}")

        # Verify: L @ L^+ should ≈ I_2×2
        identity_approx = L @ L_plus
        print(f"  L @ L^+ (should ≈ I₂):\n    {np.array2string(identity_approx, precision=4, suppress_small=True)}")

        # Simulate: 10px error → velocity
        du, dv = 10.0, 10.0
        error = np.array([du, dv])
        v_world = L_plus @ error
        print(f"  {du:.0f}px error → velocity (mm/frame): vx={v_world[0]:.1f}, vy={v_world[1]:.1f}, vz={v_world[2]:.1f}")
        print()

    # Condition number check
    print("--- Condition numbers ---")
    for u, v, Z, desc in test_points:
        L = jac.compute(u, v, Z)
        _, s, _ = np.linalg.svd(L)
        cond = s[0] / s[-1] if s[-1] > 1e-10 else float("inf")
        print(f"  {desc}: σ=[{s[0]:.4f}, {s[1]:.4f}], cond={cond:.2f}")

    print()
    print("=" * 72)
    print("Done. Verify: L @ L^+ ≈ I₂ (within floating-point tolerance)")
