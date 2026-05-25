"""MemoryRepo — per-user SQLite CRUD for raw_messages, memory_entries, meta."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.memory.paths import get_user_memory_path


@dataclass
class MemoryEntry:
    id: str
    type: str
    summary: str
    detail: str | None = None
    source_session: str | None = None
    importance: int = 50
    hits: int = 0
    last_hit_at: str | None = None
    disabled: int = 0
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "summary": self.summary,
            "detail": self.detail,
            "source_session": self.source_session,
            "importance": self.importance,
            "hits": self.hits,
            "last_hit_at": self.last_hit_at,
            "disabled": self.disabled,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> MemoryEntry:
        return cls(
            id=row["id"],
            type=row["type"],
            summary=row["summary"],
            detail=row["detail"],
            source_session=row["source_session"],
            importance=row["importance"] if row["importance"] is not None else 50,
            hits=row["hits"] if row["hits"] is not None else 0,
            last_hit_at=row["last_hit_at"],
            disabled=row["disabled"] if row["disabled"] is not None else 0,
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )


class MemoryRepo:
    def __init__(self, user_id: str):
        self._user_id = user_id
        self._db_path: Path = get_user_memory_path(user_id)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    # ── raw_messages ─────────────────────────────────────────────

    def append_raw(
        self, session_id: str, role: str, content: str, tool_call: str | None = None
    ) -> str:
        import uuid

        mid = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO raw_messages (id, session_id, role, content, tool_call) "
                "VALUES (?, ?, ?, ?, ?)",
                (mid, session_id, role, content, tool_call),
            )
            conn.commit()
        return mid

    def list_raw(self, session_id: str, limit: int = 100) -> list[sqlite3.Row]:
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT * FROM raw_messages WHERE session_id = ? "
                "ORDER BY created_at DESC LIMIT ?",
                (session_id, limit),
            )
            return list(cur.fetchall())

    # ── memory_entries ───────────────────────────────────────────

    def upsert_entry(self, entry: MemoryEntry) -> str:
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM memory_entries WHERE id = ?", (entry.id,)
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE memory_entries SET type=?, summary=?, detail=?, "
                    "source_session=?, importance=?, hits=?, last_hit_at=?, "
                    "disabled=?, updated_at=datetime('now') "
                    "WHERE id=?",
                    (
                        entry.type, entry.summary, entry.detail,
                        entry.source_session, entry.importance, entry.hits,
                        entry.last_hit_at, entry.disabled, entry.id,
                    ),
                )
            else:
                conn.execute(
                    "INSERT INTO memory_entries "
                    "(id, type, summary, detail, source_session, importance, "
                    "hits, last_hit_at, disabled) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        entry.id, entry.type, entry.summary, entry.detail,
                        entry.source_session, entry.importance, entry.hits,
                        entry.last_hit_at, entry.disabled,
                    ),
                )
            conn.commit()
        return entry.id

    def list_entries(
        self,
        type: str | None = None,
        q: str | None = None,
        include_disabled: bool = False,
        limit: int = 50,
    ) -> list[MemoryEntry]:
        sql = "SELECT * FROM memory_entries WHERE 1=1"
        params: list[Any] = []

        if not include_disabled:
            sql += " AND disabled = 0"
        if type is not None:
            sql += " AND type = ?"
            params.append(type)
        if q is not None:
            sql += " AND (summary LIKE ? OR detail LIKE ?)"
            like = f"%{q}%"
            params.extend([like, like])

        sql += " ORDER BY importance DESC, updated_at DESC LIMIT ?"
        params.append(limit)

        with self._connect() as conn:
            cur = conn.execute(sql, params)
            return [MemoryEntry.from_row(r) for r in cur.fetchall()]

    def update_entry(self, id: str, patch: dict[str, Any]) -> bool:
        allowed = {
            "type", "summary", "detail", "source_session",
            "importance", "hits", "last_hit_at", "disabled",
        }
        fields = {k: v for k, v in patch.items() if k in allowed}
        if not fields:
            return False

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        set_clause += ", updated_at = datetime('now')"
        values = [*list(fields.values()), id]

        with self._connect() as conn:
            cur = conn.execute(
                f"UPDATE memory_entries SET {set_clause} WHERE id = ?", values
            )
            conn.commit()
            return cur.rowcount > 0

    def delete_entry(self, id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM memory_entries WHERE id = ?", (id,))
            conn.commit()
            return cur.rowcount > 0

    def increment_hit(self, ids: list[str]) -> None:
        if not ids:
            return
        placeholders = ",".join("?" for _ in ids)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE memory_entries SET hits = hits + 1, "
                f"last_hit_at = datetime('now'), updated_at = datetime('now') "
                f"WHERE id IN ({placeholders})",
                ids,
            )
            conn.commit()

    # ── meta ─────────────────────────────────────────────────────

    def get_meta(self, key: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM meta WHERE key = ?", (key,)
            ).fetchone()
            return row["value"] if row else None

    def set_meta(self, key: str, value: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                (key, value),
            )
            conn.commit()
