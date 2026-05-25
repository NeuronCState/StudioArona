"""Unit tests for FaceRecognizer — ArcFace embedding + cosine similarity.

Verifies:
- Enrollment and identification flow
- Cosine similarity threshold (≥0.62 = match)
- Multiple user registration
- Delete user
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.face.recognizer import FaceRecognizer


@pytest.fixture
def recognizer():
    return FaceRecognizer(threshold=0.62)


def _random_embedding(dim: int = 512) -> np.ndarray:
    """Generate a random normalized embedding."""
    emb = np.random.randn(dim).astype(np.float32)
    return emb / np.linalg.norm(emb)


@pytest.mark.asyncio
async def test_enroll_and_identify(recognizer):
    """Enroll a user, then identify with same embedding."""
    emb = _random_embedding()
    await recognizer.enroll("alice", [emb])

    user_id, confidence = await recognizer.identify(emb)
    assert user_id == "alice"
    assert confidence >= 0.99  # Same embedding should be ~1.0


@pytest.mark.asyncio
async def test_identify_unknown(recognizer):
    """Unknown embedding should return None."""
    emb = _random_embedding()
    user_id, confidence = await recognizer.identify(emb)
    assert user_id is None
    assert confidence < recognizer.threshold


@pytest.mark.asyncio
async def test_cosine_similarity_threshold(recognizer):
    """Embeddings above threshold should match, below should not."""
    emb1 = _random_embedding()
    await recognizer.enroll("bob", [emb1])

    # Same embedding — should match
    user_id, _ = await recognizer.identify(emb1)
    assert user_id == "bob"

    # Very different embedding — should not match
    emb2 = -emb1  # Opposite direction
    user_id, _ = await recognizer.identify(emb2)
    assert user_id is None


@pytest.mark.asyncio
async def test_multiple_users(recognizer):
    """Multiple enrolled users should be distinguishable."""
    emb_alice = _random_embedding()
    emb_bob = _random_embedding()

    await recognizer.enroll("alice", [emb_alice])
    await recognizer.enroll("bob", [emb_bob])

    user_id, _ = await recognizer.identify(emb_alice)
    assert user_id == "alice"

    user_id, _ = await recognizer.identify(emb_bob)
    assert user_id == "bob"


@pytest.mark.asyncio
async def test_delete_user(recognizer):
    """Deleted user should no longer be identified."""
    emb = _random_embedding()
    await recognizer.enroll("charlie", [emb])

    user_id, _ = await recognizer.identify(emb)
    assert user_id == "charlie"

    await recognizer.delete("charlie")
    user_id, _ = await recognizer.identify(emb)
    assert user_id is None


@pytest.mark.asyncio
async def test_list_registered(recognizer):
    """list_registered should return enrolled user IDs."""
    await recognizer.enroll("alice", [_random_embedding()])
    await recognizer.enroll("bob", [_random_embedding()])

    users = await recognizer.list_registered()
    assert set(users) == {"alice", "bob"}


@pytest.mark.asyncio
async def test_enroll_averages_embeddings(recognizer):
    """Multiple embeddings should be averaged and stored."""
    # Use similar embeddings (small perturbations of a base)
    base = _random_embedding()
    embs = [base + np.random.randn(512).astype(np.float32) * 0.05 for _ in range(5)]
    # Normalize
    embs = [e / np.linalg.norm(e) for e in embs]

    await recognizer.enroll("dave", embs)

    # The stored embedding should be the average, normalized
    users = await recognizer.list_registered()
    assert "dave" in users

    # Identifying with the base embedding should match
    user_id, confidence = await recognizer.identify(base)
    assert user_id == "dave"
    assert confidence > 0.5


@pytest.mark.asyncio
async def test_empty_enrollment(recognizer):
    """Empty enrollment should fail."""
    result = await recognizer.enroll("empty", [])
    assert result is False
