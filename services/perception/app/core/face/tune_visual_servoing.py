"""Interactive visual servoing tuning harness.

Live camera → YOLO26s-seg → Image Jacobian → KMS command display.
Overlays face bbox, centroid, Jacobian debug info on each frame.

Controls:
  q        — quit
  r        — reset servo controller position
  t        — toggle KMS output (on/off)
  +/-      — adjust lambda_trans gain
  [/]      — adjust lambda_depth gain
  arrows   — adjust target face size

Usage:
  cd services/perception
  uv run python app/core/face/tune_visual_servoing.py

Or with an image file for offline testing:
  uv run python app/core/face/tune_visual_servoing.py --image test.jpg
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

import cv2
import numpy as np

from app.core.face.detector import FaceDetector
from app.core.face.tracker import FaceTracker
from app.core.face.visual_servoing import (
    CameraIntrinsics,
    VisualServoController,
    mask_centroid,
)


class TuningHarness:
    """Real-time visual servoing tuner with OpenCV display."""

    def __init__(self, camera_id: int = 1, force_yolo: bool = True):
        self.camera_id = camera_id
        self.force_yolo = force_yolo

        # Camera intrinsics — will be updated from actual frame size
        self.intrinsics = CameraIntrinsics()
        self.servo = VisualServoController(intrinsics=self.intrinsics)

        self.detector = FaceDetector(confidence_threshold=0.5, force_backend="yolo" if force_yolo else None)
        self.tracker = FaceTracker(visual_servo_controller=self.servo)

        # Display state
        self.show_kms = True
        self.paused = False
        self.fps_history: list[float] = []

        # Detection stats
        self.total_frames = 0
        self.detection_frames = 0
        self.kms_frames = 0

    async def load(self):
        await self.detector.load()
        print(f"  Detector backend: {self.detector._backend}")

    def run(self):
        """Main loop — camera → detect → IBVS → display."""
        cap = cv2.VideoCapture(self.camera_id)
        if not cap.isOpened():
            print(f"ERROR: Cannot open camera {self.camera_id}")
            sys.exit(1)

        # Set resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"  Camera: {actual_w}x{actual_h}")
        print(f"  Press 'h' for help")

        # Update intrinsics to match actual resolution
        self.intrinsics.width = actual_w
        self.intrinsics.height = actual_h
        self.intrinsics.cx = actual_w / 2
        self.intrinsics.cy = actual_h / 2
        self.intrinsics.fx = actual_w * 0.94  # ~600 for 640px width
        self.intrinsics.fy = actual_h * 1.25  # ~600 for 480px height
        self.tracker.frame_width = actual_w
        self.tracker.frame_height = actual_h

        cv2.namedWindow("IBVS Tuning", cv2.WINDOW_NORMAL)
        cv2.resizeWindow("IBVS Tuning", 960, 720)

        loop_start = time.monotonic()
        frame_times: list[float] = []

        try:
            while True:
                t0 = time.monotonic()

                ret, frame = cap.read()
                if not ret:
                    print("Frame read error")
                    break

                self.total_frames += 1
                display = frame.copy()

                # Detect
                detections = self.detector._detect_yolo(frame) if self.force_yolo else (
                    self.detector._detect_insightface(frame) if self.detector._backend == "insightface"
                    else self.detector._detect_yolo(frame)
                )

                primary = detections[0] if detections else None

                if primary is not None:
                    self.detection_frames += 1
                    # Update tracker (IBVS via visual servo controller)
                    state = self.tracker.update(primary)
                    self._draw_overlay(display, primary, state)
                else:
                    self.tracker.update(None)
                    cv2.putText(display, "No face detected", (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                self._draw_hud(display)

                cv2.imshow("IBVS Tuning", display)

                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break
                elif key == ord("h"):
                    self._print_help()
                elif key == ord("r"):
                    self.servo.reset()
                    self.tracker.reset()
                    print("[RESET] Servo controller + tracker reset")
                elif key == ord("t"):
                    self.show_kms = not self.show_kms
                    print(f"[TOGGLE] KMS output: {'ON' if self.show_kms else 'OFF'}")
                elif key == ord("=") or key == ord("+"):
                    self.servo.lambda_trans = min(2.0, self.servo.lambda_trans + 0.05)
                    print(f"[GAIN] lambda_trans = {self.servo.lambda_trans:.2f}")
                elif key == ord("-"):
                    self.servo.lambda_trans = max(0.05, self.servo.lambda_trans - 0.05)
                    print(f"[GAIN] lambda_trans = {self.servo.lambda_trans:.2f}")
                elif key == ord("]"):
                    self.servo.lambda_depth = min(2.0, self.servo.lambda_depth + 0.05)
                    print(f"[GAIN] lambda_depth = {self.servo.lambda_depth:.2f}")
                elif key == ord("["):
                    self.servo.lambda_depth = max(0.05, self.servo.lambda_depth - 0.05)
                    print(f"[GAIN] lambda_depth = {self.servo.lambda_depth:.2f}")
                elif key == 82:  # up arrow
                    self.servo.target_face_size = min(0.5, self.servo.target_face_size + 0.01)
                    print(f"[SIZE] target_face_size = {self.servo.target_face_size:.2f}")
                elif key == 84:  # down arrow
                    self.servo.target_face_size = max(0.01, self.servo.target_face_size - 0.01)
                    print(f"[SIZE] target_face_size = {self.servo.target_face_size:.2f}")
                elif key == ord("d"):
                    # Toggle dead zone
                    if self.servo.dead_zone_px > 0:
                        self.servo.dead_zone_px = 0
                        print("[DEADZONE] OFF")
                    else:
                        self.servo.dead_zone_px = 10
                        print("[DEADZONE] 10px")

                dt = time.monotonic() - t0
                frame_times.append(dt)
                if len(frame_times) > 100:
                    frame_times.pop(0)

            # End of loop
            cap.release()
            cv2.destroyAllWindows()

            elapsed = time.monotonic() - loop_start
            avg_fps = self.total_frames / elapsed if elapsed > 0 else 0
            det_rate = self.detection_frames / max(1, self.total_frames) * 100
            print(f"\n  Session stats:")
            print(f"    Frames: {self.total_frames}, Avg FPS: {avg_fps:.1f}")
            print(f"    Detection rate: {det_rate:.1f}%")
            print(f"    Final KMS position: ({self.servo.current_x:.0f}, {self.servo.current_y:.0f}, {self.servo.current_z:.0f})")

        except KeyboardInterrupt:
            cap.release()
            cv2.destroyAllWindows()

    def _draw_overlay(self, img: np.ndarray, det, state) -> None:
        """Draw face bbox, centroid, Jacobian info."""
        h, w = img.shape[:2]

        # Face bounding box
        cv2.rectangle(img, (det.x, det.y), (det.x + det.w, det.y + det.h), (0, 255, 0), 2)

        # Centroid (YOLO bbox center)
        cx, cy = int(det.center_x * w), int(det.center_y * h)
        cv2.circle(img, (cx, cy), 5, (0, 255, 255), -1)

        # Image center (target)
        cv2.drawMarker(img, (w // 2, h // 2), (255, 0, 0), cv2.MARKER_CROSS, 20, 1)

        # Error vector from center to face
        cv2.arrowedLine(img, (w // 2, h // 2), (cx, cy), (255, 255, 0), 2, tipLength=0.1)

        # Jacobian velocity vector
        if state.tracking and (state.dx != 0 or state.dy != 0):
            # Scale: velocity vector direction from center
            scale = 2.0
            end_x = int(w // 2 + state.dx * scale)
            end_y = int(h // 2 + state.dy * scale)
            cv2.arrowedLine(img, (w // 2, h // 2), (end_x, end_y), (0, 0, 255), 2, tipLength=0.15)

        # Info panel
        y0 = h - 120
        cv2.rectangle(img, (0, y0), (w, h), (0, 0, 0), -1)
        alpha = 0.5
        img[y0:h] = cv2.addWeighted(img[y0:h], alpha, np.zeros((120, w, 3), dtype=np.uint8), 1 - alpha, 0)

        panels = [
            f"Face: ({cx},{cy}) size={det.area_ratio:.3f} conf={det.confidence:.2f}",
            f"Error: du={cx-w//2:+d}px dv={cy-h//2:+d}px | dead_zone={self.servo.dead_zone_px:.0f}px",
            f"Z_est={self.servo.min_depth_mm + int(1/det.area_ratio) if det.area_ratio > 0 else 0:.0f}mm",
            f"Velocity: vx={self.servo._vx_smooth:.1f} vy={self.servo._vy_smooth:.1f} vz={self.servo._vz_smooth:.1f} mm/s",
        ]
        if state.kms_command:
            panels.append(f"KMS: {state.kms_command}")

        for i, text in enumerate(panels):
            cv2.putText(img, text, (10, y0 + 20 + i * 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)

    def _draw_hud(self, img: np.ndarray) -> None:
        """Draw HUD with current parameter values."""
        h, w = img.shape[:2]
        hud_lines = [
            f"lambda_trans={self.servo.lambda_trans:.2f}  lambda_depth={self.servo.lambda_depth:.2f}",
            f"target_size={self.servo.target_face_size:.2f}  dead_zone={self.servo.dead_zone_px:.0f}px",
            f"KMS=({'ON' if self.show_kms else 'OFF'})  pos=({self.servo.current_x:.0f},{self.servo.current_y:.0f},{self.servo.current_z:.0f})",
            "Keys: +/- trans  [/] depth  arrow size  d deadzone  r reset  t kms  q quit",
        ]
        for i, line in enumerate(hud_lines):
            cv2.putText(img, line, (10, h - 145 - i * 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)

    def _print_help(self):
        print("""
╔══════════════════════════════════════════════════╗
║        IBVS Tuning Harness — Controls           ║
╠══════════════════════════════════════════════════╣
║  q          Quit                                ║
║  r          Reset servo position                ║
║  t          Toggle KMS output                   ║
║  +/-        Adjust lambda_trans (transl gain)   ║
║  [/]        Adjust lambda_depth (depth gain)    ║
║  Up/Down    Adjust target face size             ║
║  d          Toggle dead zone                    ║
║  h          Show this help                      ║
╚══════════════════════════════════════════════════╝
""")


async def main():
    parser = argparse.ArgumentParser(description="IBVS tuning harness")
    parser.add_argument("--camera", type=int, default=1, help="Camera index (0=FaceTime, 1=USB typically)")
    parser.add_argument("--yolo", action="store_true", default=True, help="Force YOLO backend")
    args = parser.parse_args()

    print("=" * 56)
    print("  Image Jacobian Visual Servoing — Tuning Harness")
    print("=" * 56)

    harness = TuningHarness(camera_id=args.camera, force_yolo=args.yolo)
    await harness.load()
    harness.run()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
