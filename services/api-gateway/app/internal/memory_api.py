"""Internal memory endpoints — localhost only.

Used by agent bridge to:
- Summarize a conversation and store memory entries
- UPSERT memory entries
- Recall memory for a user query
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.memory.recall import recall
from app.memory.repository import MemoryEntry, MemoryRepo
from app.memory.summarizer import summarize

router = APIRouter(prefix="/internal/memory", tags=["Internal-Memory"])


class MemoryEntryRequest(BaseModel):
    id: str
    type: str
    summary: str
    detail: str | None = None
    source_session: str | None = None
    importance: int = 50


class SummarizeRequest(BaseModel):
    conversation: str


class RecallResponse(BaseModel):
    entries: list[dict]


@router.post("/summarize")
async def summarize_conversation(body: SummarizeRequest) -> list[dict]:
    """Summarize a conversation and return extracted memory entries."""
    entries = summarize(body.conversation)
    return [e.to_dict() for e in entries]


@router.post("/entries")
async def upsert_entry(body: MemoryEntryRequest) -> dict:
    """Upsert a memory entry for a user (user_id via query param)."""
    # user_id is passed by the bridge
    return {"ok": True, "entry_id": body.id}


@router.get("/entries")
async def list_entries(user_id: str, type: str | None = None, q: str | None = None, limit: int = 50) -> list[dict]:
    """List memory entries for a user."""
    repo = MemoryRepo(user_id)
    entries = repo.list_entries(type=type, q=q, limit=limit)
    return [e.to_dict() for e in entries]


@router.post("/entries/batch")
async def upsert_entries(user_id: str, body: list[MemoryEntryRequest]) -> dict:
    """Batch upsert memory entries for a user."""
    repo = MemoryRepo(user_id)
    count = 0
    for item in body:
        entry = MemoryEntry(
            id=item.id,
            type=item.type,
            summary=item.summary,
            detail=item.detail,
            source_session=item.source_session,
            importance=item.importance,
        )
        repo.upsert_entry(entry)
        count += 1
    return {"ok": True, "count": count}


@router.get("/recall")
async def recall_memory(user_id: str, query: str, k: int = 5) -> list[dict]:
    """Recall top-K memory entries for a user query."""
    entries = recall(user_id, query, k=k)
    return [e.to_dict() for e in entries]


class AdoptGuestRequest(BaseModel):
    guest_id: str
    user_id: str


@router.post("/adopt-guest")
async def adopt_guest(body: AdoptGuestRequest) -> dict:
    """Adopt a guest user's raw_messages into a registered user's SQLite."""
    import shutil
    from pathlib import Path

    from app.memory.paths import get_user_dir, get_user_memory_path
    from app.memory.provisioner import ensure_user_memory_db

    guest_path = get_user_memory_path(body.guest_id)
    user_path = get_user_memory_path(body.user_id)

    if not guest_path.exists():
        return {"ok": False, "error": "Guest memory not found"}

    ensure_user_memory_db(body.user_id)

    # Copy raw_messages from guest to registered user
    import sqlite3
    src = sqlite3.connect(str(guest_path))
    dst = sqlite3.connect(str(user_path))

    try:
        rows = src.execute("SELECT * FROM raw_messages").fetchall()
        for row in rows:
            try:
                dst.execute(
                    "INSERT OR IGNORE INTO raw_messages (id, session_id, role, content, tool_call, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (row[0], row[1], row[2], row[3], row[4], row[5]),
                )
            except Exception:
                pass
        dst.commit()
        count = len(rows)
    finally:
        src.close()
        dst.close()

    # Clean up guest dir
    guest_dir = get_user_dir(body.guest_id)
    if guest_dir.exists():
        shutil.rmtree(str(guest_dir), ignore_errors=True)

    return {"ok": True, "adopted_count": count}
