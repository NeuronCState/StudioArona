"""Depth calibration tool for image Jacobian.

Stand at a known distance from the camera, and this script measures
the face area ratio at that distance. Use multiple distances to calibrate
the `depth_calibration_const` parameter.

Usage:
  cd services/perception
  uv run python app/core/face/calibrate_depth.py --camera 1 --distance 1000
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


async def calibrate(camera_id: int, known_distance_mm: float, num_samples: int = 50):
    """Measure face area ratio at a known distance.

    Args:
        camera_id: camera index
        known_distance_mm: distance from camera to face in mm
        num_samples: number of frames to sample for averaging
    """
    print(f"  Stand {known_distance_mm}mm from camera")
    print(f"  Sampling {num_samples} frames...")
    print()

    detector = FaceDetector(confidence_threshold=0.5, force_backend="yolo")
    await detector.load()

    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"ERROR: Cannot open camera {camera_id}")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_area = w * h

    sizes: list[float] = []
    confidences: list[float] = []

    for i in range(num_samples):
        ret, frame = cap.read()
        if not ret:
            continue

        detections = detector._detect_yolo(frame)
        if detections:
            det = detections[0]
            sizes.append(det.area_ratio)
            confidences.append(det.confidence)

        if (i + 1) % 10 == 0:
            avg = np.mean(sizes[-10:]) if sizes else 0
            print(f"  [{i+1}/{num_samples}] avg area_ratio: {avg:.5f}")

        time.sleep(0.05)

    cap.release()

    if not sizes:
        print("ERROR: No face detected!")
        return

    avg_size = float(np.mean(sizes))
    std_size = float(np.std(sizes))
    avg_conf = float(np.mean(confidences))

    # Inverse square law: Z = sqrt(calibration_const / area_ratio)
    # → calibration_const = Z² * area_ratio
    calib_const = known_distance_mm ** 2 * avg_size
    calib_const_std = known_distance_mm ** 2 * std_size

    print()
    print("=" * 56)
    print(f"  Distance:     {known_distance_mm} mm")
    print(f"  Frame area:   {frame_area} px² ({w}x{h})")
    print(f"  Avg size:     {avg_size:.5f} (±{std_size:.5f})")
    print(f"  Avg conf:     {avg_conf:.3f}")
    print(f"  Calib const:  {calib_const:.1f} (±{calib_const_std:.1f})")
    print(f"  → Set VisualServoController.depth_calibration_const = {calib_const:.0f}")
    print("=" * 56)
    print()
    print("  Calibration complete. Record this value and repeat at 2-3 distances")
    print("  (e.g., 500mm, 1000mm, 2000mm) to verify consistency.")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--camera", type=int, default=1, help="Camera index")
    parser.add_argument("--distance", type=float, default=1000, help="Known distance in mm")
    parser.add_argument("--samples", type=int, default=50, help="Number of frames to sample")
    args = parser.parse_args()

    print("=" * 56)
    print("  Depth Calibration for Image Jacobian")
    print("=" * 56)
    print()

    await calibrate(args.camera, int(args.distance), args.samples)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
