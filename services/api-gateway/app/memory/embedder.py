"""Embedder — text → embedding vector.

Phase M2 mock: deterministic hash-based 384-dim vectors.
Phase M4: replace with real model (e.g. text2vec-base-chinese via sqlite-vec).
"""

import hashlib


EMBEDDING_DIM = 384


def embed(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """Convert text to a deterministic float vector using hashing.

    Mock implementation: SHA-256 hash → repeat + normalize → float vector.
    Same input always produces the same vector.
    """
    if not text:
        return [0.0] * dim

    h = hashlib.sha256(text.encode("utf-8")).digest()
    vec: list[float] = []

    for i in range(dim):
        byte_idx = i % len(h)
        seed = h[byte_idx] / 255.0
        # Shift by position to make different dimensions different
        val = (seed + (i * 0.01)) % 1.0
        # Center and scale to roughly [-1, 1]
        val = (val - 0.5) * 2.0
        vec.append(val)

    # L2 normalize
    norm = sum(v * v for v in vec) ** 0.5
    if norm > 0:
        vec = [v / norm for v in vec]

    return vec


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
