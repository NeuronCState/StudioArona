r"""Auto-calibration collector: "move-detect-record" loop.

Orchestrates the calibration workflow:
  1. Move arm to grid position via $KMS command
  2. Detect marker/face with YOLO26s-seg
  3. Record (X,Y,Z) -> (u,v) data pair
  4. After all points: solve camera calibration
  5. Verify calibration on test points

Usage:
  cd services/perception
  uv run python app/core/face/auto_calibrate.py --camera 2 --serial /dev/cu.BT04-E
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

import cv2
import numpy as np
import serial
import structlog

from app.core.face.calibration_solver import (
    CalibrationPoint,
    CameraCalibration,
    generate_nine_point_plane,
    solve_linear,
)
from app.core.face.detector import FaceDetector

logger = structlog.get_logger(subsystem="auto_calibrate")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class CalibConfig:
    """Calibration run configuration."""

    # Camera
    camera_id: int = 1  # UGREEN Camera 1080P on robotic arm
    camera_width: int = 640
    camera_height: int = 480

    # Serial (arm)
    serial_port: str = "/dev/cu.usbserial-1330"  # UART1 USB-TTL
    serial_baud: int = 115200

    # Grid
    y_mm: float = 200  # fixed depth for 九宫格
    x_range: tuple[float, float] = (-80, 80)
    z_range: tuple[float, float] = (80, 180)

    # Timing
    move_time_ms: int = 1500  # KMS movement time
    settle_time_s: float = 2.0  # wait after move before detecting
    detect_frames: int = 5  # number of frames to average

    # Detection
    yolo_conf: float = 0.5
    force_yolo: bool = True
    marker_class: str = "face"  # "face" | "person" | "bottle" | "sports ball" | "any"

    # Output
    save_frames: bool = True
    output_dir: str = str(Path(tempfile.gettempdir()) / "calibration")


# ---------------------------------------------------------------------------
# Calibration runner
# ---------------------------------------------------------------------------


@dataclass
class CalibrationRunner:
    """Orchestrates the auto-calibration pipeline."""

    config: CalibConfig = field(default_factory=CalibConfig)

    # Runtime state (set in setup)
    _serial: serial.Serial | None = None
    _detector: FaceDetector | None = None
    _cap: Any = None
    _points: list[CalibrationPoint] = field(default_factory=list)
    _target_u: float = 320.0  # expected marker pixel x at center
    _target_v: float = 240.0  # expected marker pixel y at center

    async def setup(self) -> None:
        """Initialize camera, detector, and serial."""
        cfg = self.config

        # Camera
        self._cap = cv2.VideoCapture(cfg.camera_id)
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, cfg.camera_width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.camera_height)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open camera {cfg.camera_id}")
        actual_w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"  Camera: {actual_w}x{actual_h}")

        # Target = image center
        self._target_u = actual_w / 2.0
        self._target_v = actual_h / 2.0

        # Detector
        self._detector = FaceDetector(
            confidence_threshold=cfg.yolo_conf,
            force_backend="yolo" if cfg.force_yolo else None,
        )
        await self._detector.load()
        print(f"  Detector: {self._detector._backend}")

        # Serial
        try:
            self._serial = serial.Serial(cfg.serial_port, baudrate=cfg.serial_baud, timeout=2)
            print(f"  Serial: {cfg.serial_port} @ {cfg.serial_baud}")
        except Exception as e:
            print(f"  Serial: UNAVAILABLE ({e}) — running in detect-only mode")
            self._serial = None

        # Warm up camera
        for _ in range(10):
            self._cap.read()

        # Ensure output dir
        Path(cfg.output_dir).mkdir(parents=True, exist_ok=True)

    async def cleanup(self) -> None:
        """Release resources."""
        if self._cap:
            self._cap.release()
        if self._serial:
            self._serial.close()
        cv2.destroyAllWindows()

    # ------------------------------------------------------------------
    # Arm control
    # ------------------------------------------------------------------

    def _send_kms(self, x: float, y: float, z: float, time_ms: int | None = None) -> None:
        """Send \$KMS command to arm."""
        if self._serial is None:
            print(f"  [MOCK KMS] x={x:.0f} y={y:.0f} z={z:.0f}")
            return

        t = time_ms or self.config.move_time_ms
        cmd = f"$KMS:{int(x)},{int(y)},{int(z)},{t}!"
        self._serial.write(cmd.encode("ascii"))
        self._serial.flush()
        print(f"  [KMS] → {cmd.strip()}")

    def _send_stop(self) -> None:
        """Emergency stop all servos."""
        if self._serial:
            self._serial.write(b"$DST!")
            self._serial.flush()
            print("  [STOP] sent")

    def _send_reset(self) -> None:
        """Reset all servos to center position."""
        if self._serial:
            self._serial.write(b"$DJR!")
            self._serial.flush()
            print("  [RESET] servos → center")

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    def _detect_marker(self) -> tuple[float, float, float, float] | None:
        """Detect marker in current frame.

        Uses YOLO26s-seg. Marker type depends on config.marker_class:
          - "face": detect person class, use largest detection as face
          - "person": detect person class
          - any COCO class name: "bottle", "sports ball", "cup", "book", etc.
          - "any": detect any object, use the largest

        Returns (u, v, confidence, area_ratio) or None.
        """
        ret, frame = self._cap.read()
        if not ret:
            return None

        results = self._detector._yolo_model(frame, verbose=False, conf=self.config.yolo_conf)

        # COCO class name → ID mapping (subset)
        coco_names = {
            "person": 0, "bicycle": 1, "car": 2, "motorcycle": 3,
            "bottle": 39, "wine glass": 40, "cup": 41, "fork": 42,
            "knife": 43, "spoon": 44, "bowl": 45, "banana": 46,
            "apple": 47, "sandwich": 48, "orange": 49, "broccoli": 50,
            "carrot": 51, "hot dog": 52, "pizza": 53, "donut": 54,
            "cake": 55, "chair": 56, "couch": 57, "potted plant": 58,
            "bed": 59, "dining table": 60, "toilet": 61, "tv": 62,
            "laptop": 63, "mouse": 64, "remote": 65, "keyboard": 66,
            "cell phone": 67, "microwave": 68, "oven": 69, "toaster": 70,
            "sink": 71, "refrigerator": 72, "book": 73, "clock": 74,
            "vase": 75, "scissors": 76, "teddy bear": 77, "hair drier": 78,
            "toothbrush": 79, "sports ball": 32,
        }

        cfg = self.config
        target_cls = cfg.marker_class
        target_id = None
        if target_cls == "face":
            target_id = 0  # person class
        elif target_cls != "any":
            target_id = coco_names.get(target_cls)

        detections = []
        h, w = frame.shape[:2]
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                cls_id = int(box.cls[0])
                if target_id is not None and cls_id != target_id:
                    continue
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                conf = float(box.conf[0])
                bw, bh = x2 - x1, y2 - y1
                cx = (x1 + bw / 2) / w
                cy = (y1 + bh / 2) / h
                area = (bw * bh) / (w * h)
                detections.append((cx, cy, conf, area, cls_id))

        # Sort by area (largest first) for face/person, by confidence for objects
        if target_cls in ("face", "person"):
            detections.sort(key=lambda d: d[3], reverse=True)
        else:
            detections.sort(key=lambda d: d[2], reverse=True)

        if not detections:
            return None

        cx, cy, conf, area, cls_id = detections[0]
        cls_name = [k for k, v in coco_names.items() if v == cls_id]
        cls_name = cls_name[0] if cls_name else f"class_{cls_id}"

        u = cx * self.config.camera_width
        v = cy * self.config.camera_height
        logger.debug("marker_detected", u=round(u, 1), v=round(v, 1),
                      conf=round(conf, 3), cls=cls_name)
        return (u, v, conf, area)

    def _average_detection(self, n_frames: int = 5) -> tuple[float, float, float] | None:
        """Average detection over n frames for stability."""
        us, vs, confs = [], [], []
        for _ in range(n_frames):
            result = self._detect_marker()
            if result:
                u, v, conf, _ = result
                us.append(u)
                vs.append(v)
                confs.append(conf)
            time.sleep(0.05)

        if len(us) < n_frames // 2:
            return None

        return (
            float(np.mean(us)),
            float(np.mean(vs)),
            float(np.mean(confs)),
        )

    # ------------------------------------------------------------------
    # Main calibration loop
    # ------------------------------------------------------------------

    async def run(self) -> CameraCalibration | None:
        """Run the full auto-calibration pipeline."""
        cfg = self.config
        positions = generate_nine_point_plane(
            y_mm=cfg.y_mm,
            z_range=cfg.z_range,
            x_range=cfg.x_range,
        )

        print()
        print("=" * 56)
        print(f"  Auto-Calibration: 九宫格 ({len(positions)} points)")
        print(f"  Y = {cfg.y_mm}mm, X = {cfg.x_range}, Z = {cfg.z_range}")
        print("=" * 56)
        print()

        self._points = []

        for idx, (x, y, z) in enumerate(positions):
            print(f"[{idx+1}/{len(positions)}] 目标: ({x:.0f}, {y:.0f}, {z:.0f})")

            # 1. Move arm to target
            self._send_kms(x, y, z, cfg.move_time_ms)

            # 2. Wait for arm to settle
            print(f"  等待 {cfg.settle_time_s}s ...")
            time.sleep(cfg.settle_time_s)

            # 3. Detect marker
            result = self._average_detection(cfg.detect_frames)
            if result is None:
                print(f"  ⚠ 未检测到标记物，跳过此点")
                continue

            u, v, conf = result
            error_u = u - self._target_u
            error_v = v - self._target_v

            print(f"  检测: u={u:.1f} v={v:.1f} conf={conf:.2f} "
                  f"| error=({error_u:+.0f}, {error_v:+.0f})px")

            # 4. Record data pair
            point = CalibrationPoint(
                x_mm=x,
                y_mm=y,
                z_mm=z,
                u_px=u,
                v_px=v,
                confidence=conf,
            )
            self._points.append(point)

            # 5. Save debug frame
            if cfg.save_frames:
                self._save_debug_frame(idx, x, y, z, u, v)

        # ------------------------------------------------------------------
        # Solve calibration
        # ------------------------------------------------------------------
        print()
        print("=" * 56)
        print(f"  Solving calibration from {len(self._points)} points...")
        print("=" * 56)

        if len(self._points) < 4:
            print(f"  FAIL: need ≥4 points, got {len(self._points)}")
            return None

        calib = solve_linear(self._points)
        if calib is None:
            print("  FAIL: solver returned None")
            return None

        print(f"  {calib}")
        print()

        # Verify on a test point
        print("  Verifying calibration with test point...")
        self._verify_calibration(calib)

        return calib

    def _save_debug_frame(
        self, idx: int, x: float, y: float, z: float, u: float, v: float
    ) -> None:
        """Save annotated frame for debugging."""
        ret, frame = self._cap.read()
        if not ret:
            return

        # Draw marker and center crosshair
        h, w = frame.shape[:2]
        cx, cy = int(self._target_u), int(self._target_v)
        cv2.drawMarker(frame, (int(u), int(v)), (0, 255, 0), cv2.MARKER_CROSS, 20, 2)
        cv2.drawMarker(frame, (cx, cy), (255, 0, 0), cv2.MARKER_CROSS, 20, 1)
        cv2.putText(frame, f"({int(x)},{int(y)},{int(z)}) → ({u:.0f},{v:.0f})",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        path = f"{self.config.output_dir}/point_{idx:02d}.jpg"
        cv2.imwrite(path, frame)

    def _verify_calibration(self, calib: CameraCalibration) -> None:
        """Send arm to a new test point and verify prediction."""
        # Test point: center-right, mid height
        test_x, test_y, test_z = 40.0, 250.0, 120.0
        print(f"  测试点: ({test_x:.0f}, {test_y:.0f}, {test_z:.0f})")

        self._send_kms(test_x, test_y, test_z)
        time.sleep(self.config.settle_time_s)

        result = self._average_detection(self.config.detect_frames)
        if result is None:
            print("  ⚠ 测试点未检测到标记物")
            return

        u_actual, v_actual, _ = result

        # Predict pixel position from calibration
        u_pred = calib.fx * test_x / test_y + calib.cx
        v_pred = -calib.fy * test_z / test_y + calib.cy

        err_u = u_actual - u_pred
        err_v = v_actual - v_pred
        err_total = np.sqrt(err_u ** 2 + err_v ** 2)

        print(f"  预测: u={u_pred:.1f} v={v_pred:.1f}")
        print(f"  实际: u={u_actual:.1f} v={v_actual:.1f}")
        print(f"  误差: du={err_u:+.1f} dv={err_v:+.1f} total={err_total:.1f}px")
        print(f"  {'✓ 标定精度良好' if err_total < 20 else '⚠ 可能需要更多数据点'}")

    # ------------------------------------------------------------------
    # Interactive mode — manual data collection
    # ------------------------------------------------------------------

    async def interactive_collect(self) -> CameraCalibration | None:
        """Manual mode: user positions face, press SPACE to record point."""
        print()
        print("=" * 56)
        print("  Interactive Calibration Mode")
        print("  SPACE = record current face position + arm coords")
        print("  q     = finish and solve")
        print("  r     = reset arm to home")
        print("=" * 56)

        cv2.namedWindow("Calibration", cv2.WINDOW_NORMAL)
        cv2.resizeWindow("Calibration", 960, 720)

        # Move arm to initial position
        self._send_reset()

        while True:
            ret, frame = self._cap.read()
            if not ret:
                continue

            display = frame.copy()
            detections = self._detector._detect_yolo(frame)

            if detections:
                det = detections[0]
                u = det.center_x * self.config.camera_width
                v = det.center_y * self.config.camera_height
                cv2.circle(display, (int(u), int(v)), 5, (0, 255, 0), -1)
                cv2.putText(display, f"({u:.0f}, {v:.0f}) size={det.area_ratio:.3f}",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

            cv2.putText(display, f"Points: {len(self._points)} | SPACE=record Q=done",
                        (10, display.shape[0] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

            cv2.imshow("Calibration", display)
            key = cv2.waitKey(1) & 0xFF

            if key == ord("q"):
                break
            elif key == ord(" "):  # SPACE
                if detections:
                    det = detections[0]
                    u = det.center_x * self.config.camera_width
                    v = det.center_y * self.config.camera_height
                    # Ask for arm coordinates
                    print(f"\n  检测到人脸: ({u:.0f}, {v:.0f}) size={det.area_ratio:.3f}")
                    try:
                        x_str = input("  输入当前X (mm): ")
                        y_str = input("  输入当前Y (mm): ")
                        z_str = input("  输入当前Z (mm): ")
                        x, y, z = float(x_str), float(y_str), float(z_str)
                        self._points.append(CalibrationPoint(
                            x_mm=x, y_mm=y, z_mm=z,
                            u_px=u, v_px=v,
                            confidence=det.confidence,
                        ))
                        print(f"  ✓ 已记录 #{len(self._points)}: ({x:.0f},{y:.0f},{z:.0f}) → ({u:.0f},{v:.0f})")
                    except ValueError:
                        print("  ⚠ 输入无效")
                else:
                    print("  ⚠ 未检测到人脸")
            elif key == ord("r"):
                self._send_reset()

        cv2.destroyAllWindows()

        if len(self._points) >= 4:
            return solve_linear(self._points)
        else:
            print(f"  Need ≥4 points, got {len(self._points)}")
            return None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Auto-calibration for image Jacobian")
    parser.add_argument("--camera", type=int, default=2, help="Camera index")
    parser.add_argument("--serial", type=str, default="/dev/cu.BT04-E",
                        help="Serial port (or 'none' for detect-only)")
    parser.add_argument("--mode", choices=["auto", "interactive"], default="auto",
                        help="auto=grid scan, interactive=manual SPACE capture")
    parser.add_argument("--y", type=float, default=200, help="Fixed Y depth for 九宫格")
    parser.add_argument("--time", type=int, default=1500, help="KMS move time ms")
    args = parser.parse_args()

    config = CalibConfig(
        camera_id=args.camera,
        serial_port=args.serial if args.serial != "none" else "",
        y_mm=args.y,
        move_time_ms=args.time,
    )

    runner = CalibrationRunner(config)

    try:
        await runner.setup()

        if args.mode == "interactive":
            calib = await runner.interactive_collect()
        else:
            calib = await runner.run()

        if calib:
            print()
            print("=" * 56)
            print("  CALIBRATION RESULT")
            print("=" * 56)
            print(f"  fx = {calib.fx:.1f}  fy = {calib.fy:.1f}")
            print(f"  cx = {calib.cx:.1f}  cy = {calib.cy:.1f}")
            print(f"  RMS = {calib.residual:.2f} px")
            print()
            print("  Usage in VisualServoController:")
            print(f"    intrinsics = CameraIntrinsics(")
            print(f"        fx={calib.fx:.0f}, fy={calib.fy:.0f},")
            print(f"        cx={calib.cx:.0f}, cy={calib.cy:.0f},")
            print(f"    )")
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
