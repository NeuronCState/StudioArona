"""Face detector — InsightFace + YOLO fallback + Haar cascade.

Pipeline: frame → InsightFace detect → pick largest/closest face → bbox + confidence
Mac stage: CPU/MPS inference
Linux stage: CUDA inference

Performance target: ≥15 fps Mac, ≥30 fps Linux V100

Models:
  Primary:   InsightFace buffalo_l (det_10g.onnx + w600k_r50.onnx)
  Fallback:  YOLOv8n (ultralytics pretrained, person class for face detection)
  Emergency: OpenCV Haar cascade frontalface_default
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import structlog
from numpy.typing import NDArray

logger = structlog.get_logger(subsystem="face")

# Type alias for BGR frame
Frame = NDArray[np.uint8]

# Model paths
_MODELS_DIR = Path(__file__).parent.parent.parent.parent / "models"


@dataclass
class FaceDetection:
    """Single face detection result."""

    x: int  # top-left x
    y: int  # top-left y
    w: int  # width
    h: int  # height
    confidence: float
    center_x: float  # normalized [0, 1]
    center_y: float  # normalized [0, 1]
    area_ratio: float  # bbox area / frame area, normalized [0, 1]
    embedding: NDArray[np.float32] | None = None  # face embedding (if available)


class FaceDetector:
    """Face detector with multiple backends.

    Priority: InsightFace > YOLO > Haar cascade
    """

    def __init__(
        self,
        confidence_threshold: float = 0.5,
        force_backend: str | None = None,
    ) -> None:
        """Args:
        confidence_threshold: minimum detection confidence [0, 1]
        force_backend: 'insightface' | 'yolo' | 'haar' — skip priority chain
        """
        self._conf_threshold = confidence_threshold
        self._force_backend = force_backend
        self._insightface_app = None
        self._yolo_model = None
        self._haar_cascade = None
        self._backend = "none"

    async def load(self) -> None:
        """Load detection model. Call once at startup.

        Priority (unless force_backend is set):
          InsightFace > YOLO > Haar cascade
        """
        if self._force_backend:
            await self._load_forced()
            return

        # Try InsightFace first (best quality)
        self._insightface_app = await asyncio.to_thread(self._load_insightface)
        if self._insightface_app is not None:
            self._backend = "insightface"
            logger.info("model_loaded", type="InsightFace buffalo_l", backend="insightface")
            return

        # Fallback to YOLO
        self._yolo_model = await asyncio.to_thread(self._load_yolo)
        if self._yolo_model is not None:
            self._backend = "yolo"
            logger.info("model_loaded", type="YOLO26s-seg", backend="yolo")
            return

        # Final fallback: Haar cascade
        self._haar_cascade = await asyncio.to_thread(self._load_haar)
        self._backend = "haar"
        logger.warning("model_fallback_haar", reason="No ML models available")

    async def _load_forced(self) -> None:
        """Load only the forced backend."""
        backend = self._force_backend
        if backend == "insightface":
            self._insightface_app = await asyncio.to_thread(self._load_insightface)
            if self._insightface_app is None:
                raise RuntimeError("InsightFace failed to load (forced backend)")
            self._backend = "insightface"
        elif backend == "yolo":
            self._yolo_model = await asyncio.to_thread(self._load_yolo)
            if self._yolo_model is None:
                raise RuntimeError("YOLO failed to load (forced backend)")
            self._backend = "yolo"
        elif backend == "haar":
            self._haar_cascade = await asyncio.to_thread(self._load_haar)
            self._backend = "haar"
        else:
            raise ValueError(f"Unknown backend: {backend}")
        logger.info("model_loaded", type=self._force_backend, backend=self._backend)

    async def detect(self, frame: Frame) -> list[FaceDetection]:
        """Detect faces in frame. Returns list sorted by area (largest first)."""
        if self._backend == "insightface":
            return await asyncio.to_thread(self._detect_insightface, frame)
        elif self._backend == "yolo":
            return await asyncio.to_thread(self._detect_yolo, frame)
        else:
            return await asyncio.to_thread(self._detect_haar, frame)

    def _load_insightface(self):
        """Try to load InsightFace model."""
        try:
            from insightface.app import FaceAnalysis

            model_root = str(_MODELS_DIR)
            app = FaceAnalysis(
                name="buffalo_l",
                root=model_root,
                providers=["CPUExecutionProvider"],
            )
            app.prepare(ctx_id=-1, det_size=(640, 640))
            return app
        except Exception as e:
            logger.debug("insightface_load_failed", error=str(e))
            return None

    def _load_yolo(self):
        """Try to load YOLO model."""
        try:
            from ultralytics import YOLO

            model_path = _MODELS_DIR / "yolo26s-seg.pt"
            model = YOLO(str(model_path))
            return model
        except Exception:
            return None

    def _load_haar(self):
        """Load OpenCV Haar cascade as fallback."""
        import cv2

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        return cv2.CascadeClassifier(cascade_path)

    def _detect_insightface(self, frame: Frame) -> list[FaceDetection]:
        """Detect using InsightFace (detection + embedding in one pass)."""
        h, w = frame.shape[:2]
        faces = self._insightface_app.get(frame)

        detections = []
        for face in faces:
            if face.det_score < self._conf_threshold:
                continue

            x1, y1, x2, y2 = face.bbox.astype(int)
            bw, bh = x2 - x1, y2 - y1
            cx = (x1 + bw / 2) / w
            cy = (y1 + bh / 2) / h
            area = (bw * bh) / (w * h)

            detections.append(
                FaceDetection(
                    x=int(x1), y=int(y1), w=int(bw), h=int(bh),
                    confidence=float(face.det_score),
                    center_x=cx, center_y=cy, area_ratio=area,
                    embedding=face.embedding if face.embedding is not None else None,
                )
            )

        detections.sort(key=lambda d: d.area_ratio, reverse=True)
        return detections

    def _detect_yolo(self, frame: Frame) -> list[FaceDetection]:
        """Detect using YOLO model."""
        h, w = frame.shape[:2]
        results = self._yolo_model(frame, verbose=False, conf=self._conf_threshold)

        detections = []
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                conf = float(box.conf[0])
                bw, bh = x2 - x1, y2 - y1
                cx = (x1 + bw / 2) / w
                cy = (y1 + bh / 2) / h
                area = (bw * bh) / (w * h)
                detections.append(
                    FaceDetection(
                        x=int(x1), y=int(y1), w=int(bw), h=int(bh),
                        confidence=conf, center_x=cx, center_y=cy, area_ratio=area,
                    )
                )

        detections.sort(key=lambda d: d.area_ratio, reverse=True)
        return detections

    def _detect_haar(self, frame: Frame) -> list[FaceDetection]:
        """Detect using Haar cascade fallback."""
        import cv2

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self._haar_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
        )

        detections = []
        for (x, y, bw, bh) in faces:
            cx = (x + bw / 2) / w
            cy = (y + bh / 2) / h
            area = (bw * bh) / (w * h)
            detections.append(
                FaceDetection(
                    x=int(x), y=int(y), w=int(bw), h=int(bh),
                    confidence=0.8,  # Haar doesn't give confidence
                    center_x=cx, center_y=cy, area_ratio=area,
                )
            )

        detections.sort(key=lambda d: d.area_ratio, reverse=True)
        return detections
