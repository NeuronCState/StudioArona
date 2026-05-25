r"""Face-centering closed loop using image Jacobian.

Iteratively adjusts arm via $KMS commands to center face in camera.
Uses FaceDetector (YOLO26s-seg) + serial UART1.

Usage:
  cd services/perception
  uv run python app/core/face/center_face.py
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

import numpy as np
import serial
import structlog

from app.core.face.detector import FaceDetector

logger = structlog.get_logger(subsystem="center_face")

SERIAL_PORT = "/dev/cu.usbserial-1330"  # UART1 via USB-TTL
CAMERA_ID = 1  # UGREEN Camera 1080P on arm

# Jacobian parameters (defaults, will be calibrated)
FX, FY = 600.0, 600.0
CX, CY = 320.0, 240.0

# Control
KP = 0.3
DEAD_ZONE = 15
MAX_DELTA = 50  # max mm per iteration
Y_MIN, Y_MAX = 100, 302
Z_MIN, Z_MAX = 0, 230
X_MAX = 150


async def main():
    import cv2

    print("=" * 56)
    print("  Face Centering — IBVS Closed Loop")
    print("=" * 56)

    # Serial
    ser = serial.Serial(SERIAL_PORT, baudrate=115200, timeout=2)
    print(f"  Serial: {SERIAL_PORT} OK")

    # Camera
    cap = cv2.VideoCapture(CAMERA_ID)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cx_img, cy_img = w / 2.0, h / 2.0
    print(f"  Camera: {w}x{h}, center=({cx_img:.0f}, {cy_img:.0f})")

    # Detector
    detector = FaceDetector(confidence_threshold=0.5, force_backend="yolo")
    await detector.load()
    print(f"  Detector: {detector._backend}")

    # Warm up camera
    for _ in range(10):
        cap.read()

    # Move arm to safe starting position
    start_x, start_y, start_z = 0, 200, 150
    print(f"  Moving to start: ({start_x}, {start_y}, {start_z})")
    ser.write(f"$KMS:{start_x},{start_y},{start_z},2500!".encode())
    ser.flush()
    time.sleep(3.0)

    current_x, current_y, current_z = start_x, start_y, start_z

    print()
    print(f"  Target: face at image center ({cx_img:.0f}, {cy_img:.0f})")
    print("  Press Ctrl+C to stop")
    print()

    converged = False
    try:
        for iteration in range(15):
            ret, frame = cap.read()
            if not ret:
                continue

            detections = await detector.detect(frame)
            primary = detections[0] if detections else None

            if primary is None:
                print(f"  [{iteration:2d}] No face detected")
                time.sleep(0.5)
                continue

            u = primary.center_x * w
            v = primary.center_y * h
            du = u - cx_img
            dv = v - cy_img
            size = primary.area_ratio

            # Depth estimate from face size
            if size > 0.001:
                Z_est = np.sqrt(50000 / size)
                Z_est = float(np.clip(Z_est, 100, 3000))
            else:
                Z_est = 2000.0

            # Image Jacobian: pixel error -> world correction
            dx = KP * du * Z_est / FX
            dz = -KP * dv * Z_est / FY

            # Dead zone
            if abs(du) < DEAD_ZONE:
                dx = 0.0
            if abs(dv) < DEAD_ZONE:
                dz = 0.0

            # Clamp
            dx = float(np.clip(dx, -MAX_DELTA, MAX_DELTA))
            dz = float(np.clip(dz, -MAX_DELTA, MAX_DELTA))

            if dx == 0.0 and dz == 0.0:
                print(f"  [{iteration:2d}] CENTERED! u={u:.0f} v={v:.0f} err=({du:+.0f}, {dv:+.0f})px")
                converged = True
                break

            # Update position
            current_x = float(np.clip(current_x + dx, -X_MAX, X_MAX))
            current_z = float(np.clip(current_z + dz, Z_MIN, Z_MAX))

            # Send KMS
            cmd = f"$KMS:{int(current_x)},{int(current_y)},{int(current_z)},800!"
            ser.write(cmd.encode())
            ser.flush()

            print(f"  [{iteration:2d}] face=({u:.0f}, {v:.0f}) err=({du:+.0f}, {dv:+.0f})px "
                  f"Zest={Z_est:.0f}mm | d=({dx:+.0f}, {dz:+.0f})mm → "
                  f"KMS=({int(current_x)},{int(current_y)},{int(current_z)})")

            # Check for error reply
            time.sleep(0.3)
            if ser.in_waiting:
                reply = ser.read(ser.in_waiting)
                if reply:
                    print(f"  [reply] {reply.decode(errors='ignore').strip()}")

            time.sleep(1.2)  # wait for arm movement

    except KeyboardInterrupt:
        print("\n  Stopped by user")
    finally:
        ser.write(b"$SMART_STOP!")
        ser.flush()
        cap.release()
        ser.close()
        cv2.destroyAllWindows()

        if converged:
            print()
            print("=" * 56)
            print(f"  CONVERGED at ({int(current_x)}, {int(current_y)}, {int(current_z)})")
            print("  Calibration ready — run auto_calibrate.py next")
            print("=" * 56)


if __name__ == "__main__":
    asyncio.run(main())
