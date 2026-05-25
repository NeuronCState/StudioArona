"""Provision per-user SQLite memory database with full schema."""

import sqlite3
import uuid
from pathlib import Path

from app.memory.paths import ensure_user_dir, get_user_memory_path

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS raw_messages (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL,
    role          TEXT NOT NULL,
    content       TEXT NOT NULL,
    tool_call     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_raw_session ON raw_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_raw_created ON raw_messages(created_at);

CREATE TABLE IF NOT EXISTS memory_entries (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    summary       TEXT NOT NULL,
    detail        TEXT,
    source_session TEXT,
    importance    INTEGER DEFAULT 50,
    hits          INTEGER DEFAULT 0,
    last_hit_at   TEXT,
    disabled      INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_type ON memory_entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_importance ON memory_entries(importance DESC);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def _new_id() -> str:
    return str(uuid.uuid4())


def ensure_user_memory_db(user_id: str) -> Path:
    ensure_user_dir(user_id)
    db_path = get_user_memory_path(user_id)

    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    finally:
        conn.close()

    return db_path


def reset_user_memory_db(user_id: str) -> None:
    db_path = get_user_memory_path(user_id)
    if db_path.exists():
        db_path.unlink()
    ensure_user_memory_db(user_id)
