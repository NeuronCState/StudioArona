"""Recall — vector-based memory recall with importance weighting.

Pipeline:
  1. embed(query) → query vector
  2. score each entry = cosine_similarity(query_vec, entry_vec)
  3. weighted_score = sim * (importance/100) * (1 + hits/10) * recency_factor
  4. filter disabled entries
  5. return top-K, call increment_hit
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from app.memory.embedder import cosine_similarity, embed
from app.memory.paths import get_user_memory_path
from app.memory.repository import MemoryEntry, MemoryRepo


def _recency_factor(updated_at: str | None) -> float:
    """Decay factor based on last update time. Recent = closer to 1."""
    if not updated_at:
        return 0.5
    try:
        dt = datetime.fromisoformat(updated_at).replace(tzinfo=timezone.utc)
    except ValueError:
        return 0.5

    days = (datetime.now(timezone.utc) - dt).total_seconds() / 86400
    # Halve every 30 days
    return math.exp(-0.0231 * days)


def recall(
    user_id: str,
    query: str,
    k: int = 5,
    candidate_multiplier: int = 3,
) -> list[MemoryEntry]:
    """Recall top-K memory entries for a user query.

    Args:
        user_id: The user whose memory to query.
        query: The text to match against memory entries.
        k: Number of entries to return.
        candidate_multiplier: Fetch top (k * candidate_multiplier) candidates
            by vector similarity before applying importance/recency weighting.
    """
    repo = MemoryRepo(user_id)
    if not get_user_memory_path(user_id).exists():
        return []

    query_vec = embed(query)

    entries = repo.list_entries(include_disabled=False, limit=200)

    if not entries:
        return []

    # Score each entry
    scored: list[tuple[float, MemoryEntry]] = []
    for entry in entries:
        entry_vec = embed(entry.summary)
        sim = cosine_similarity(query_vec, entry_vec)
        importance_factor = entry.importance / 100.0
        hits_bonus = 1.0 + (entry.hits / 10.0)
        recency = _recency_factor(entry.updated_at)
        weighted = sim * importance_factor * hits_bonus * recency
        scored.append((weighted, entry))

    # Sort by score descending
    scored.sort(key=lambda x: x[0], reverse=True)

    # Top K
    top_ids = [e.id for _, e in scored[:k]]

    if top_ids:
        repo.increment_hit(top_ids)

    return [e for _, e in scored[:k]]
