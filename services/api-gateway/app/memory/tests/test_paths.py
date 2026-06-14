"""Tests for memory path helpers."""

import os
import tempfile

from app.memory.paths import (
    ensure_user_dir,
    get_user_data_dir,
    get_user_dir,
    get_user_memory_path,
)


def test_get_user_data_dir_default():
    d = get_user_data_dir()
    assert d.name == "javis-data"


def test_get_user_data_dir_from_env():
    test_dir = os.path.join(tempfile.gettempdir(), "javis-test")
    os.environ["JAVIS_USER_DATA_DIR"] = test_dir
    d = get_user_data_dir()
    assert str(d) == test_dir
    del os.environ["JAVIS_USER_DATA_DIR"]


def test_get_user_dir():
    d = get_user_dir("user-123")
    assert d.name == "user-123"
    assert "users" in str(d)


def test_get_user_memory_path():
    p = get_user_memory_path("user-456")
    assert p.name == "memory.sqlite"
    assert "user-456" in str(p)


def test_ensure_user_dir_creates_structure():
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["JAVIS_USER_DATA_DIR"] = tmp
        p = ensure_user_dir("test-user")
        assert p.exists()
        assert (p / "attachments").exists()
        del os.environ["JAVIS_USER_DATA_DIR"]
