"""Performance test: face detection FPS.

Target: ≥15 fps Mac, ≥30 fps Linux V100

Usage:
    uv run python tests/C/perf/face_fps.py
"""

from __future__ import annotations

import asyncio
import time

import cv2
import numpy as np

from app.core.face.detector import FaceDetector


async def main():
    detector = FaceDetector(confidence_threshold=0.5)
    await detector.load()

    # Create a test frame (640x480 BGR with a face-like rectangle)
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[150:350, 220:420] = (180, 200, 230)  # Skin tone

    # Warmup
    for _ in range(5):
        await detector.detect(frame)

    # Benchmark
    num_frames = 100
    start = time.monotonic()
    for _ in range(num_frames):
        await detector.detect(frame)
    elapsed = time.monotonic() - start

    fps = num_frames / elapsed
    print(f"Face detection FPS: {fps:.1f}")
    print(f"Time per frame: {elapsed / num_frames * 1000:.1f} ms")
    print(f"Backend: {detector._backend}")

    target = 15.0  # Mac target
    if fps >= target:
        print(f"PASS: {fps:.1f} >= {target} fps")
    else:
        print(f"FAIL: {fps:.1f} < {target} fps")


if __name__ == "__main__":
    asyncio.run(main())
