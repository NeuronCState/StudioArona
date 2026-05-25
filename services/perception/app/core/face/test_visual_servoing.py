"""Integration test: YOLO26s-seg → Image Jacobian IBVS → KMS command.

Verifies the full visual servoing pipeline end-to-end:
  1. Load YOLO26s-seg model
  2. Create VisualServoController with ImageJacobian
  3. Create FaceTracker with IBVS mode
  4. Simulate face detections at various positions
  5. Verify KMS command output

Usage:
  cd services/perception
  uv run python app/core/face/test_visual_servoing.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure perception is on the path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from app.core.face.detector import FaceDetector, FaceDetection
from app.core.face.tracker import FaceTracker
from app.core.face.visual_servoing import (
    CameraIntrinsics,
    VisualServoController,
)


def test_jacobian_math():
    """Verify the Jacobian math on known inputs."""
    print("=" * 60)
    print("Test 1: Jacobian math verification")
    print("=" * 60)

    intrinsics = CameraIntrinsics()
    controller = VisualServoController(intrinsics=intrinsics)

    # Face at center, 1m away → no movement
    cmd = controller.compute_command(320, 240, 0.08)
    assert cmd is None, f"Face at center should be in dead zone, got: {cmd}"
    print("  PASS: face at center → no command (dead zone)")

    # Face offset right (run multiple frames for meaningful movement)
    for _ in range(15):  # 1 second at 15fps
        cmd = controller.compute_command(400, 240, 0.08)
    assert cmd is not None, "Face offset right should produce command"
    assert cmd.dx_mm > 0, f"Right offset should give positive dx, got {cmd.dx_mm}"
    print(f"  PASS: face right → dx={cmd.dx_mm}mm, dy={cmd.dy_mm}mm, dz={cmd.dz_mm}mm")

    # Face offset left
    controller.reset()
    for _ in range(15):
        cmd = controller.compute_command(240, 240, 0.08)
    assert cmd is not None, "Face offset left should produce command"
    assert cmd.dx_mm < 0, f"Left offset should give negative dx, got {cmd.dx_mm}"
    print(f"  PASS: face left → dx={cmd.dx_mm}mm, dy={cmd.dy_mm}mm, dz={cmd.dz_mm}mm")

    # Face offset down
    controller.reset()
    for _ in range(15):
        cmd = controller.compute_command(320, 300, 0.08)
    assert cmd is not None, "Face offset down should produce command"
    assert cmd.dy_mm > 0, f"Down offset should give positive dy, got {cmd.dy_mm}"
    print(f"  PASS: face down → dx={cmd.dx_mm}mm, dy={cmd.dy_mm}mm, dz={cmd.dz_mm}mm")

    # Close face should produce depth correction (run multiple frames to converge)
    controller.reset()
    dz_total = 0
    for _ in range(30):  # simulate 2 seconds at 15fps
        cmd = controller.compute_command(320, 240, 0.15)
        if cmd:
            dz_total += cmd.dz_mm
    assert dz_total < 0, f"Large face should move back (negative dz), got total {dz_total}mm"
    print(f"  PASS: large face → total dz={dz_total}mm (moving back over 30 frames)")

    # Far face should produce depth correction
    controller.reset()
    dz_total = 0
    for _ in range(30):
        cmd = controller.compute_command(320, 240, 0.02)
        if cmd:
            dz_total += cmd.dz_mm
    assert dz_total > 0, f"Small face should move forward (positive dz), got total {dz_total}mm"
    print(f"  PASS: small face → total dz={dz_total}mm (moving forward over 30 frames)")

    print()


def test_kms_format():
    """Verify KMS command formatting."""
    print("=" * 60)
    print("Test 2: KMS command format")
    print("=" * 60)

    intrinsics = CameraIntrinsics()
    controller = VisualServoController(intrinsics=intrinsics)

    # Position the controller and run frames to produce movement
    controller.current_x = 100.0
    controller.current_y = 180.0
    controller.current_z = 100.0

    cmd = None
    for _ in range(15):
        cmd = controller.compute_command(400, 240, 0.08)
    kms = cmd.kms_string

    # Verify format: $KMS:x,y,z,time!
    assert kms.startswith("$KMS:"), f"Bad prefix: {kms}"
    assert kms.endswith("!"), f"Bad suffix: {kms}"

    parts = kms[5:-1].split(",")
    assert len(parts) == 4, f"Expected 4 parts, got {len(parts)}: {parts}"

    x, y, z, t = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
    assert t == 500, f"Default time should be 500ms, got {t}"
    assert 0 <= x <= 250, f"X out of workspace: {x}"
    assert 100 <= y <= 302, f"Y out of workspace: {y}"
    assert 0 <= z <= 230, f"Z out of workspace: {z}"

    print(f"  PASS: {kms}")
    print(f"        target=({x}, {y}, {z}), time={t}ms")
    print()


def test_tracker_ibvs_integration():
    """Verify FaceTracker + VisualServoController integration."""
    print("=" * 60)
    print("Test 3: FaceTracker + IBVS integration")
    print("=" * 60)

    intrinsics = CameraIntrinsics()
    servo = VisualServoController(intrinsics=intrinsics)
    tracker = FaceTracker(visual_servo_controller=servo)

    # Simulate a face at center with target size (should be in dead zone → no KMS)
    # target_face_size=0.08, so face area = 0.08 * 640 * 480 = 24576 pixels
    # face ~157x157 pixels at center
    face_w, face_h = 157, 157
    det_center = FaceDetection(
        x=int(320 - face_w / 2),
        y=int(240 - face_h / 2),
        w=face_w,
        h=face_h,
        confidence=0.9,
        center_x=320 / 640,
        center_y=240 / 480,
        area_ratio=(face_w * face_h) / (640 * 480),
    )
    # Run a few frames to let the low-pass filter settle
    for _ in range(5):
        state = tracker.update(det_center)
    assert state.kms_command == "", f"Center face should not produce KMS: {state.kms_command}"
    print("  PASS: center face at target size → no KMS (dead zone)")

    # Simulate face moving right (run several frames for smoothing to build up)
    face_w, face_h = 157, 157
    det_right = FaceDetection(
        x=int(400 - face_w / 2),
        y=int(240 - face_h / 2),
        w=face_w,
        h=face_h,
        confidence=0.9,
        center_x=400 / 640,
        center_y=240 / 480,
        area_ratio=(face_w * face_h) / (640 * 480),
    )
    state = None
    for _ in range(15):
        state = tracker.update(det_right)
    assert state.kms_command, f"Right face should produce KMS: {state.kms_command}"
    assert state.dx > 0, f"Right face dx should be positive: {state.dx}"
    print(f"  PASS: right face → KMS={state.kms_command}")

    # Verify reset
    tracker.reset()
    assert tracker.state.kms_command == ""
    print("  PASS: reset clears KMS command")

    print()


def test_yolo_detect_and_servo():
    """Test with real YOLO26s-seg model if available."""
    print("=" * 60)
    print("Test 4: YOLO26s-seg detection + IBVS (requires model)")
    print("=" * 60)

    import asyncio

    async def _run():
        detector = FaceDetector(force_backend="yolo")
        try:
            await detector.load()
        except Exception as e:
            print(f"  SKIP: YOLO model not available ({e})")
            return

        # Create a dummy frame (black)
        import numpy as np
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        detections = await detector.detect(frame)

        intrinsics = CameraIntrinsics()
        servo = VisualServoController(intrinsics=intrinsics)
        tracker = FaceTracker(visual_servo_controller=servo)

        if detections:
            state = tracker.update(detections[0])
            print(f"  Detection: ({state.x:.3f}, {state.y:.3f}), size={state.size:.4f}")
            if state.kms_command:
                print(f"  KMS: {state.kms_command}")
            else:
                print("  No KMS (within dead zone or no significant movement)")
        else:
            print("  No face detected in dummy frame (expected)")

        print("  PASS: YOLO pipeline runs without error")

    asyncio.run(_run())
    print()


if __name__ == "__main__":
    test_jacobian_math()
    test_kms_format()
    test_tracker_ibvs_integration()
    test_yolo_detect_and_servo()

    print("=" * 60)
    print("All tests passed!")
    print("=" * 60)
