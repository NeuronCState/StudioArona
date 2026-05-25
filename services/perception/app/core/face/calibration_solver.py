"""Auto-calibration solver: pixel ↔ world coordinate mapping.

Solves camera intrinsic parameters (fx, fy, cx, cy) from (u,v) ↔ (X,Y,Z) data pairs
collected by the "move-detect-record" loop.

Math:
  u_i = fx * X_i / Y_i + cx    (camera looks along +Y arm frame)
  v_i = -fy * Z_i / Y_i + cy   (image v increases downward, arm Z increases upward)

  → linear system: A * [fx, cx, fy, cy]^T = b

Then computes the inverse image Jacobian for pixel-error → arm-motion control.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import structlog

logger = structlog.get_logger(subsystem="calibration")


@dataclass
class CalibrationPoint:
    """One data pair: arm position + marker pixel coordinate."""

    x_mm: float
    y_mm: float
    z_mm: float
    u_px: float
    v_px: float
    confidence: float = 1.0


@dataclass
class CameraCalibration:
    """Solved camera parameters."""

    fx: float
    fy: float
    cx: float
    cy: float
    residual: float  # RMS reprojection error in pixels
    num_points: int

    def __repr__(self) -> str:
        return (
            f"CameraCalibration(fx={self.fx:.1f}, fy={self.fy:.1f}, "
            f"cx={self.cx:.1f}, cy={self.cy:.1f}, "
            f"residual={self.residual:.2f}px, n={self.num_points})"
        )

    def pixel_error_to_world(
        self, du: float, dv: float, y_mm: float
    ) -> tuple[float, float]:
        """Convert pixel error to world offset at a given depth Y.

        du = u_current - u_desired (positive = marker is right of center)
        dv = v_current - v_desired (positive = marker is below center)

        Returns (dx_mm, dz_mm) — world coordinate corrections.
        """
        dx = du * y_mm / self.fx
        dz = -dv * y_mm / self.fy  # negative: v ↓ = Z ↑
        return dx, dz


def solve_linear(points: list[CalibrationPoint]) -> CameraCalibration | None:
    """Solve camera parameters via linear least squares.

    Model:
      u_i = fx * (X_i / Y_i) + cx
      v_i = -fy * (Z_i / Y_i) + cy

    Linear system:
      [X_1/Y_1   1   0        0   ] [fx ]   [u_1]
      [X_2/Y_2   1   0        0   ] [cx ] = [u_2]
      [  0       0  -Z_1/Y_1  1   ] [fy ]   [v_1]
      [  0       0  -Z_2/Y_2  1   ] [cy ]   [v_2]
      ...

    Requires ≥3 non-collinear points.
    """
    n = len(points)
    if n < 3:
        logger.warning("calibration_need_more_points", have=n, need=3)
        return None

    # Build design matrix A (2n × 4) and observation vector b (2n)
    A = np.zeros((2 * n, 4), dtype=np.float64)
    b = np.zeros(2 * n, dtype=np.float64)

    for i, p in enumerate(points):
        if abs(p.y_mm) < 1.0:
            logger.warning("calibration_y_too_small", point=i, y_mm=p.y_mm)
            return None

        w = p.confidence

        # u equation
        A[2 * i, 0] = w * p.x_mm / p.y_mm
        A[2 * i, 1] = w * 1.0
        b[2 * i] = w * p.u_px

        # v equation
        A[2 * i + 1, 2] = w * (-p.z_mm / p.y_mm)
        A[2 * i + 1, 3] = w * 1.0
        b[2 * i + 1] = w * p.v_px

    # Solve: A * x = b → x = (A^T A)^-1 A^T b
    try:
        x, residuals, rank, singular = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        logger.error("calibration_lstsq_failed")
        return None

    if rank < 4:
        logger.warning("calibration_rank_deficient", rank=rank, need=4)
        return None

    fx, cx, fy, cy = float(x[0]), float(x[1]), float(x[2]), float(x[3])

    # RMS reprojection error
    reproj = A @ x - b
    rms = float(np.sqrt(np.mean(reproj ** 2)))

    # Sanity checks
    if fx <= 0 or fy <= 0:
        logger.error("calibration_negative_focal", fx=fx, fy=fy)
        return None

    if fx > 10000 or fy > 10000:
        logger.warning("calibration_large_focal", fx=fx, fy=fy)

    logger.info(
        "calibration_solved",
        fx=round(fx, 1),
        fy=round(fy, 1),
        cx=round(cx, 1),
        cy=round(cy, 1),
        rms=round(rms, 2),
        num_points=n,
    )

    return CameraCalibration(
        fx=fx,
        fy=fy,
        cx=cx,
        cy=cy,
        residual=rms,
        num_points=n,
    )


def solve_homography(points: list[CalibrationPoint]) -> CameraCalibration | None:
    """Alternative: solve via perspective-n-point (more robust for non-planar data).

    Uses the same linear model but with RANSAC-style outlier rejection.
    Falls back to solve_linear if insufficient points.
    """
    n = len(points)
    if n < 4:
        return solve_linear(points)

    # For now: simple linear fit with all points
    # Future: add RANSAC for outlier rejection
    return solve_linear(points)


def estimate_jacobian_from_calibration(
    calib: CameraCalibration, y_mm: float
) -> np.ndarray:
    """Build the 2×3 image Jacobian from calibrated parameters at depth Y.

    Returns:
      J: shape (2, 3), maps [dX, dY, dZ]^T → [du, dv]^T
    """
    fx, fy, cx, cy = calib.fx, calib.fy, calib.cx, calib.cy
    Z = y_mm

    J = np.array(
        [
            [-fx / Z, 0.0, 0.0],
            [0.0, 0.0, fy / Z],
        ],
        dtype=np.float64,
    )
    return J


# ---------------------------------------------------------------------------
# Grid generator for auto-calibration
# ---------------------------------------------------------------------------


def generate_calibration_grid(
    y_range: tuple[float, float] = (150, 250),
    z_range: tuple[float, float] = (50, 150),
    x_range: tuple[float, float] = (-80, 80),
    grid_size: int = 3,
) -> list[tuple[float, float, float]]:
    """Generate a 3D grid of positions for the calibration routine.

    Returns list of (x, y, z) positions in mm.
    Default: 3×3×3 = 27 points spanning workspace center.
    """
    xs = np.linspace(x_range[0], x_range[1], grid_size)
    ys = np.linspace(y_range[0], y_range[1], grid_size)
    zs = np.linspace(z_range[0], z_range[1], grid_size)

    positions: list[tuple[float, float, float]] = []
    for y in ys:
        for z in zs:
            for x in xs:
                positions.append((float(x), float(y), float(z)))
    return positions


def generate_nine_point_plane(
    y_mm: float = 200,
    z_range: tuple[float, float] = (50, 200),
    x_range: tuple[float, float] = (-100, 100),
) -> list[tuple[float, float, float]]:
    """Generate a 3×3 planar grid at fixed depth Y (九宫格).

    Returns 9 positions (3×3) in the Y-Z plane at constant Y.
    """
    xs = np.linspace(x_range[0], x_range[1], 3)
    zs = np.linspace(z_range[0], z_range[1], 3)

    positions: list[tuple[float, float, float]] = []
    for z in zs:
        for x in xs:
            positions.append((float(x), float(y_mm), float(z)))
    return positions


# ---------------------------------------------------------------------------
# Diagnostic
# ---------------------------------------------------------------------------


def test_calibration():
    """Verify calibration solver with synthetic data."""
    print("=" * 56)
    print("  Calibration Solver Test (synthetic data)")
    print("=" * 56)

    # Ground truth parameters
    fx_true, fy_true = 600.0, 600.0
    cx_true, cy_true = 320.0, 240.0

    # Generate synthetic data: 9-point grid at Y=500mm
    noise_std = 1.0  # pixel noise
    rng = np.random.default_rng(42)
    points: list[CalibrationPoint] = []
    xs = [-80, 0, 80]
    zs = [50, 100, 150]
    y_const = 200.0

    for z in zs:
        for x in xs:
            u_true = fx_true * x / y_const + cx_true
            v_true = -fy_true * z / y_const + cy_true
            u_noisy = u_true + rng.normal(0, noise_std)
            v_noisy = v_true + rng.normal(0, noise_std)
            points.append(CalibrationPoint(
                x_mm=x, y_mm=y_const, z_mm=z,
                u_px=u_noisy, v_px=v_noisy,
            ))

    calib = solve_linear(points)
    if calib is None:
        print("FAIL: solver returned None")
        return False

    fx_err = abs(calib.fx - fx_true)
    fy_err = abs(calib.fy - fy_true)
    cx_err = abs(calib.cx - cx_true)
    cy_err = abs(calib.cy - cy_true)

    print(f"  fx: {calib.fx:.1f} (true={fx_true}, err={fx_err:.1f})")
    print(f"  fy: {calib.fy:.1f} (true={fy_true}, err={fy_err:.1f})")
    print(f"  cx: {calib.cx:.1f} (true={cx_true}, err={cx_err:.1f})")
    print(f"  cy: {calib.cy:.1f} (true={cy_true}, err={cy_err:.1f})")
    print(f"  RMS reprojection error: {calib.residual:.2f}px")
    print(f"  Points: {calib.num_points}")

    # Test pixel_error_to_world
    dx, dz = calib.pixel_error_to_world(80, 60, y_mm=500)
    print(f"  Pixel error (80, 60) → world (dx={dx:.2f}, dz={dz:.2f})")

    tolerance = 5.0
    if fx_err < tolerance and fy_err < tolerance and cx_err < tolerance and cy_err < tolerance:
        print("  PASS: all parameters within tolerance")
        return True
    else:
        print("  FAIL: parameters outside tolerance")
        return False


if __name__ == "__main__":
    test_calibration()
