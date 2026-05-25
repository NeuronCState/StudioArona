"""Face tracking main loop — camera → detect → recognize → track → serial + WS.

Pipeline (03 规划书 §6.1):
  camera frame → InsightFace detect → pick largest face
    → ArcFace recognize (if registered users exist)
    → tracker update (low-pass + P-control)
    → serial write (cmd=0x01, dx, dy, depth)
    → WS push face_track event
    → wake/leave events on state transitions (with user_id + confidence)

Runs in background as asyncio task.
"""

from __future__ import annotations

import asyncio
import time

import structlog

from app.core.face.detector import FaceDetector
from app.core.face.recognizer import FaceRecognizer
from app.core.face.tracker import FaceTracker, TrackState
from app.core.serial.base import SerialPort
from app.ws.publisher import EventPublisher

logger = structlog.get_logger(subsystem="face_loop")


class FaceLoop:
    """Camera → detect → recognize → track → serial + WS pipeline."""

    def __init__(
        self,
        camera,  # CameraSource
        detector: FaceDetector,
        recognizer: FaceRecognizer,
        tracker: FaceTracker,
        serial: SerialPort,
        publisher: EventPublisher,
        target_fps: int = 15,
    ) -> None:
        self._camera = camera
        self._detector = detector
        self._recognizer = recognizer
        self._tracker = tracker
        self._serial = serial
        self._publisher = publisher
        self._target_fps = target_fps
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the face tracking loop."""
        if self._running:
            return

        await self._detector.load()
        await self._recognizer.load()
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("face_loop_started", target_fps=self._target_fps)

    async def stop(self) -> None:
        """Stop the face tracking loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("face_loop_stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    async def _run_loop(self) -> None:
        """Main loop: read frame → detect → recognize → track → publish."""
        frame_interval = 1.0 / self._target_fps
        last_tracking = False
        last_user_id: str | None = None
        last_confidence: float = 0.0

        try:
            while self._running:
                start = time.monotonic()

                try:
                    frame = await self._camera.read()
                except Exception as e:
                    logger.warning("frame_read_error", error=str(e))
                    await asyncio.sleep(0.1)
                    continue

                # Detect faces
                detections = await self._detector.detect(frame)
                primary = detections[0] if detections else None

                # Recognize face if detection has embedding
                user_id = None
                confidence = 0.0
                if primary is not None and primary.embedding is not None:
                    user_id, confidence = await self._recognizer.identify(primary.embedding)
                elif primary is not None:
                    # If detector didn't provide embedding, try to extract it
                    # (crop the face region and pass to recognizer)
                    pass

                # Update tracker
                state = self._tracker.update(primary)

                # Publish face_track event if tracking
                if state.tracking:
                    await self._publisher.face_track(
                        x=state.x, y=state.y, size=state.size
                    )

                # Wake event — on transition to tracking
                if state.tracking and not last_tracking:
                    await self._publisher.wake(
                        user_id=user_id or "unknown",
                        confidence=confidence,
                    )
                    logger.info(
                        "wake_event",
                        user_id=user_id or "unknown",
                        confidence=round(confidence, 3),
                    )

                # Leave event — on transition from tracking
                if not state.tracking and last_tracking:
                    await self._publisher.leave(
                        duration_ms=state.lost_frames * int(frame_interval * 1000)
                    )

                last_tracking = state.tracking
                last_user_id = user_id
                last_confidence = confidence

                # Send serial command if tracking
                if state.tracking:
                    await self._send_serial(state)

                # FPS control
                elapsed = time.monotonic() - start
                sleep_time = frame_interval - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("face_loop_error", error=str(e))

    async def _send_serial(self, state: TrackState) -> None:
        """Send tracking offset via serial protocol.

        When KMS command is available (IBVS mode), sends it as text.
        Otherwise sends binary protocol frame (P-control mode).
        """
        if state.kms_command:
            # IBVS mode: send KMS text command directly
            await self._serial.write(state.kms_command.encode("ascii"))
            logger.debug(
                "serial_kms_sent",
                kms=state.kms_command,
                dx=state.dx,
                dy=state.dy,
                dz=state.depth_mm,
            )
        else:
            # P-control mode: send binary protocol frame
            from app.core.serial.protocol import encode_target

            frame = encode_target(state.dx, state.dy, state.depth_mm)
            await self._serial.write(frame)
