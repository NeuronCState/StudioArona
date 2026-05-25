"""Face enrollment — register new members.

Flow: user confirms → 5-10 photos → ArcFace embeddings → average → store
Privacy: only embeddings stored, no face images persisted.
"""

from __future__ import annotations

import asyncio

import numpy as np
import structlog
from numpy.typing import NDArray

from app.core.face.recognizer import FaceRecognizer

logger = structlog.get_logger(subsystem="face")


class FaceEnrollment:
    """Face enrollment manager.

    Collects multiple face embeddings from camera frames,
    then stores the average embedding in the recognizer.
    """

    def __init__(self, recognizer: FaceRecognizer, min_frames: int = 5, max_frames: int = 10) -> None:
        self._recognizer = recognizer
        self._min_frames = min_frames
        self._max_frames = max_frames
        self._pending: dict[str, list[NDArray[np.float32]]] = {}

    async def start_enrollment(self, user_id: str) -> bool:
        """Start enrollment for a user."""
        if user_id in self._pending:
            return False
        self._pending[user_id] = []
        logger.info("enrollment_started", user_id=user_id)
        return True

    async def add_frame(self, user_id: str, frame: NDArray[np.uint8]) -> int:
        """Add a frame for enrollment. Returns count of collected embeddings.

        The detector should extract the face crop, then we get the embedding.
        """
        if user_id not in self._pending:
            return 0

        embedding = await self._recognizer.extract_embedding(frame)
        if embedding is None:
            return len(self._pending[user_id])

        self._pending[user_id].append(embedding)
        count = len(self._pending[user_id])
        logger.debug("enrollment_frame_added", user_id=user_id, count=count)
        return count

    async def add_embedding(self, user_id: str, embedding: NDArray[np.float32]) -> int:
        """Add a pre-extracted embedding for enrollment."""
        if user_id not in self._pending:
            return 0

        self._pending[user_id].append(embedding)
        return len(self._pending[user_id])

    async def finalize(self, user_id: str) -> bool:
        """Finalize enrollment — compute average and store."""
        if user_id not in self._pending:
            return False

        embeddings = self._pending.pop(user_id)
        if len(embeddings) < self._min_frames:
            logger.warning(
                "enrollment_insufficient",
                user_id=user_id,
                collected=len(embeddings),
                required=self._min_frames,
            )
            return False

        # Take up to max_frames
        embeddings = embeddings[: self._max_frames]

        success = await self._recognizer.enroll(user_id, embeddings)
        if success:
            logger.info("enrollment_completed", user_id=user_id, num_embeddings=len(embeddings))
        return success

    async def cancel(self, user_id: str) -> bool:
        """Cancel an in-progress enrollment."""
        if user_id in self._pending:
            del self._pending[user_id]
            logger.info("enrollment_cancelled", user_id=user_id)
            return True
        return False

    @property
    def pending_users(self) -> list[str]:
        """List users with in-progress enrollment."""
        return list(self._pending.keys())
