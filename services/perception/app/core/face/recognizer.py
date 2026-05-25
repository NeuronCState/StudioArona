"""Face recognizer — ArcFace / InsightFace.

Pipeline:
  face image → ArcFace embedding → cosine similarity → match registered users
  threshold ≥ 0.62 → matched user_id
  threshold < 0.62 → unknown face

Registration: 5-10 photos → average embedding → store in user_face_embeddings
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import structlog
from numpy.typing import NDArray

logger = structlog.get_logger(subsystem="face")

_MODELS_DIR = Path(__file__).parent.parent.parent.parent / "models"


@dataclass
class RegisteredFace:
    """A registered face embedding."""

    user_id: str
    embedding: NDArray[np.float32]


@dataclass
class FaceRecognizer:
    """ArcFace-based face recognition.

    Uses InsightFace buffalo_l model for embedding extraction.
    Cosine similarity matching against registered embeddings.
    """

    threshold: float = 0.62
    _insightface_app = None
    _registered: list[RegisteredFace] = field(default_factory=list)

    async def load(self) -> None:
        """Load recognition model."""
        self._insightface_app = await asyncio.to_thread(self._load_model)
        if self._insightface_app is not None:
            logger.info("recognizer_loaded", model="ArcFace (buffalo_l)")
        else:
            logger.warning("recognizer_not_loaded", reason="InsightFace not available")

    async def extract_embedding(self, face_image: NDArray[np.uint8]) -> NDArray[np.float32] | None:
        """Extract face embedding from a face crop image."""
        if self._insightface_app is None:
            return None

        def _extract():
            faces = self._insightface_app.get(face_image)
            if faces and faces[0].embedding is not None:
                return faces[0].embedding
            return None

        return await asyncio.to_thread(_extract)

    async def identify(self, embedding: NDArray[np.float32]) -> tuple[str | None, float]:
        """Identify a face by matching against registered embeddings.

        Returns (user_id, confidence) or (None, 0.0) if no match.
        """
        if not self._registered:
            return None, 0.0

        best_match = None
        best_similarity = -1.0

        for registered in self._registered:
            similarity = self._cosine_similarity(embedding, registered.embedding)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = registered.user_id

        if best_similarity >= self.threshold:
            return best_match, float(best_similarity)
        return None, float(best_similarity)

    async def enroll(self, user_id: str, embeddings: list[NDArray[np.float32]]) -> bool:
        """Register a user with one or more face embeddings.

        Stores the average embedding for the user.
        """
        if not embeddings:
            return False

        # Remove existing registration for this user
        self._registered = [r for r in self._registered if r.user_id != user_id]

        # Average the embeddings
        avg_embedding = np.mean(embeddings, axis=0)
        # Normalize
        avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)

        self._registered.append(RegisteredFace(user_id=user_id, embedding=avg_embedding))
        logger.info("face_enrolled", user_id=user_id, num_embeddings=len(embeddings))
        return True

    async def delete(self, user_id: str) -> bool:
        """Delete a user's face registration."""
        before = len(self._registered)
        self._registered = [r for r in self._registered if r.user_id != user_id]
        deleted = len(self._registered) < before
        if deleted:
            logger.info("face_deleted", user_id=user_id)
        return deleted

    async def list_registered(self) -> list[str]:
        """List registered user IDs."""
        return list(set(r.user_id for r in self._registered))

    def _load_model(self):
        """Load InsightFace model for recognition."""
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
            logger.debug("recognizer_load_failed", error=str(e))
            return None

    @staticmethod
    def _cosine_similarity(a: NDArray[np.float32], b: NDArray[np.float32]) -> float:
        """Compute cosine similarity between two embeddings."""
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
