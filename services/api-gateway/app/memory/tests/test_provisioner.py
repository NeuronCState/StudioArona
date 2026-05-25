"""Tests for memory provisioner."""

import os
import sqlite3
import tempfile

from app.memory.provisioner import ensure_user_memory_db, reset_user_memory_db


def _setup_env(tmpdir: str):
    os.environ["JAVIS_USER_DATA_DIR"] = tmpdir


def test_ensure_user_memory_db_creates_file():
    with tempfile.TemporaryDirectory() as tmp:
        _setup_env(tmp)
        db_path = ensure_user_memory_db("user-1")
        assert db_path.exists()
        assert db_path.suffix == ".sqlite"


def test_ensure_user_memory_db_has_tables():
    with tempfile.TemporaryDirectory() as tmp:
        _setup_env(tmp)
        db_path = ensure_user_memory_db("user-2")
        conn = sqlite3.connect(str(db_path))
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        conn.close()
        assert "raw_messages" in tables
        assert "memory_entries" in tables
        assert "meta" in tables


def test_ensure_user_memory_db_is_idempotent():
    with tempfile.TemporaryDirectory() as tmp:
        _setup_env(tmp)
        db_path = ensure_user_memory_db("user-3")
        mtime1 = db_path.stat().st_mtime
        ensure_user_memory_db("user-3")
        mtime2 = db_path.stat().st_mtime
        assert mtime2 == mtime1


def test_reset_user_memory_db():
    with tempfile.TemporaryDirectory() as tmp:
        _setup_env(tmp)
        db_path = ensure_user_memory_db("user-4")
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "INSERT INTO raw_messages (id, session_id, role, content) "
            "VALUES ('m1', 's1', 'user', 'hello')"
        )
        conn.commit()
        conn.close()

        reset_user_memory_db("user-4")
        assert db_path.exists()
        conn = sqlite3.connect(str(db_path))
        rows = conn.execute("SELECT COUNT(*) FROM raw_messages").fetchone()
        conn.close()
        assert rows[0] == 0
