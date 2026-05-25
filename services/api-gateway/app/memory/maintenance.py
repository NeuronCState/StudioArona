"""Memory maintenance — decay, dedup, and cleanup.

Phase M4: automatic memory hygiene.
"""

from __future__ import annotations

from app.memory.embedder import cosine_similarity, embed
from app.memory.repository import MemoryEntry, MemoryRepo

DECAY_DAYS = 30
DECAY_IMPORTANCE_MAX = 30
DEDUP_SIMILARITY_THRESHOLD = 0.92


def run_decay(user_id: str) -> int:
    """Disable entries that haven't been accessed in DECAY_DAYS days
    and have importance below DECAY_IMPORTANCE_MAX."""
    repo = MemoryRepo(user_id)
    entries = repo.list_entries(include_disabled=False, limit=500)
    disabled = 0

    for entry in entries:
        if entry.importance >= DECAY_IMPORTANCE_MAX:
            continue
        if _should_decay(entry):
            repo.update_entry(entry.id, {"disabled": 1})
            disabled += 1

    return disabled


def _should_decay(entry: MemoryEntry) -> bool:
    """Check if an entry should be decayed based on last_hit_at and importance."""
    if entry.importance >= DECAY_IMPORTANCE_MAX:
        return False

    if not entry.last_hit_at:
        # Never been hit — use updated_at or created_at
        ref_time = entry.updated_at or entry.created_at
        if not ref_time:
            return False
        return _days_since(ref_time) >= DECAY_DAYS

    return _days_since(entry.last_hit_at) >= DECAY_DAYS


def _days_since(iso_timestamp: str) -> int:
    """Calculate days since an ISO timestamp."""
    from datetime import datetime, timezone

    try:
        dt = datetime.fromisoformat(iso_timestamp).replace(tzinfo=timezone.utc)
        return int((datetime.now(timezone.utc) - dt).total_seconds() / 86400)
    except (ValueError, TypeError):
        return 0


def run_dedup(user_id: str) -> int:
    """Merge entries with cosine similarity > DEDUP_SIMILARITY_THRESHOLD.
    Higher importance entry survives, lower one gets disabled.
    """
    repo = MemoryRepo(user_id)
    entries = repo.list_entries(include_disabled=False, limit=500)

    if len(entries) < 2:
        return 0

    merged = 0

    for i, e1 in enumerate(entries):
        if e1.disabled:
            continue
        v1 = embed(e1.summary)
        for j in range(i + 1, len(entries)):
            e2 = entries[j]
            if e2.disabled:
                continue
            v2 = embed(e2.summary)
            sim = cosine_similarity(v1, v2)

            if sim >= DEDUP_SIMILARITY_THRESHOLD:
                if e1.importance >= e2.importance:
                    # e1 survives, merge e2's importance
                    merged_imp = max(e1.importance, e2.importance)
                    repo.update_entry(e1.id, {"importance": merged_imp})
                    repo.update_entry(e2.id, {"disabled": 1})
                else:
                    merged_imp = max(e1.importance, e2.importance)
                    repo.update_entry(e2.id, {"importance": merged_imp})
                    repo.update_entry(e1.id, {"disabled": 1})
                merged += 1

    return merged


def run_maintenance(user_id: str) -> dict:
    """Run all maintenance tasks for a user."""
    decayed = run_decay(user_id)
    deduped = run_dedup(user_id)
    return {"decayed": decayed, "deduped": deduped}
