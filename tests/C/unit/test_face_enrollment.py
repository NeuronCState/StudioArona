"""Unit tests for FaceEnrollment — enrollment workflow.

Verifies:
- start → add → finalize flow
- Minimum frame requirement
- Cancel flow
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.face.enrollment import FaceEnrollment
from app.core.face.recognizer import FaceRecognizer


@pytest.fixture
def recognizer():
    return FaceRecognizer(threshold=0.62)


@pytest.fixture
def enrollment(recognizer):
    return FaceEnrollment(recognizer, min_frames=3, max_frames=5)


def _random_embedding(dim: int = 512) -> np.ndarray:
    emb = np.random.randn(dim).astype(np.float32)
    return emb / np.linalg.norm(emb)


@pytest.mark.asyncio
async def test_start_enrollment(enrollment):
    success = await enrollment.start_enrollment("alice")
    assert success is True
    assert "alice" in enrollment.pending_users


@pytest.mark.asyncio
async def test_start_duplicate(enrollment):
    await enrollment.start_enrollment("alice")
    success = await enrollment.start_enrollment("alice")
    assert success is False


@pytest.mark.asyncio
async def test_add_embedding(enrollment):
    await enrollment.start_enrollment("alice")
    count = await enrollment.add_embedding("alice", _random_embedding())
    assert count == 1

    count = await enrollment.add_embedding("alice", _random_embedding())
    assert count == 2


@pytest.mark.asyncio
async def test_finalize_success(enrollment, recognizer):
    await enrollment.start_enrollment("bob")
    for _ in range(4):
        await enrollment.add_embedding("bob", _random_embedding())

    success = await enrollment.finalize("bob")
    assert success is True
    assert "bob" not in enrollment.pending_users

    # User should now be registered
    users = await recognizer.list_registered()
    assert "bob" in users


@pytest.mark.asyncio
async def test_finalize_insufficient_frames(enrollment):
    await enrollment.start_enrollment("charlie")
    await enrollment.add_embedding("charlie", _random_embedding())

    success = await enrollment.finalize("charlie")
    assert success is False


@pytest.mark.asyncio
async def test_cancel(enrollment):
    await enrollment.start_enrollment("dave")
    await enrollment.add_embedding("dave", _random_embedding())

    success = await enrollment.cancel("dave")
    assert success is True
    assert "dave" not in enrollment.pending_users


@pytest.mark.asyncio
async def test_cancel_nonexistent(enrollment):
    success = await enrollment.cancel("nobody")
    assert success is False
