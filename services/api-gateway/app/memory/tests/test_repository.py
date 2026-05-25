"""Tests for MemoryRepo."""

import os
import tempfile

import pytest

from app.memory.provisioner import ensure_user_memory_db
from app.memory.repository import MemoryEntry, MemoryRepo


@pytest.fixture
def repo():
    tmp = tempfile.mkdtemp()
    os.environ["JAVIS_USER_DATA_DIR"] = tmp
    ensure_user_memory_db("test-user")
    r = MemoryRepo("test-user")
    yield r
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    if "JAVIS_USER_DATA_DIR" in os.environ:
        del os.environ["JAVIS_USER_DATA_DIR"]


class TestRawMessages:
    def test_append_raw(self, repo):
        mid = repo.append_raw("s1", "user", "hello")
        assert mid is not None
        rows = repo.list_raw("s1")
        assert len(rows) == 1
        assert rows[0]["content"] == "hello"

    def test_list_raw_limit(self, repo):
        for i in range(5):
            repo.append_raw("s1", "user", f"msg-{i}")
        rows = repo.list_raw("s1", limit=3)
        assert len(rows) == 3

    def test_list_raw_empty(self, repo):
        rows = repo.list_raw("no-such-session")
        assert len(rows) == 0


class TestMemoryEntries:
    def test_upsert_and_list(self, repo):
        entry = MemoryEntry(
            id="e1", type="fact", summary="用户叫老张", importance=80
        )
        repo.upsert_entry(entry)
        results = repo.list_entries()
        assert len(results) == 1
        assert results[0].summary == "用户叫老张"

    def test_upsert_update(self, repo):
        entry = MemoryEntry(
            id="e2", type="fact", summary="旧信息", importance=30
        )
        repo.upsert_entry(entry)
        entry.summary = "新信息"
        entry.importance = 90
        repo.upsert_entry(entry)
        results = repo.list_entries()
        assert len(results) == 1
        assert results[0].summary == "新信息"
        assert results[0].importance == 90

    def test_list_entries_by_type(self, repo):
        repo.upsert_entry(MemoryEntry(id="e1", type="fact", summary="事实1"))
        repo.upsert_entry(MemoryEntry(id="e2", type="preference", summary="偏好1"))
        facts = repo.list_entries(type="fact")
        assert len(facts) == 1
        assert facts[0].type == "fact"

    def test_list_entries_search(self, repo):
        repo.upsert_entry(MemoryEntry(id="e1", type="fact", summary="老张喜欢喝茶"))
        repo.upsert_entry(MemoryEntry(id="e2", type="fact", summary="老李喜欢咖啡"))
        results = repo.list_entries(q="老张")
        assert len(results) == 1
        assert "老张" in results[0].summary

    def test_list_entries_excludes_disabled(self, repo):
        repo.upsert_entry(
            MemoryEntry(id="e1", type="fact", summary="正常", disabled=0)
        )
        repo.upsert_entry(
            MemoryEntry(id="e2", type="fact", summary="禁用", disabled=1)
        )
        results = repo.list_entries()
        assert len(results) == 1

    def test_update_entry(self, repo):
        repo.upsert_entry(MemoryEntry(id="e1", type="fact", summary="原始"))
        ok = repo.update_entry("e1", {"summary": "已修改", "importance": 99})
        assert ok
        results = repo.list_entries()
        assert results[0].summary == "已修改"
        assert results[0].importance == 99

    def test_update_entry_invalid_field_ignored(self, repo):
        repo.upsert_entry(MemoryEntry(id="e1", type="fact", summary="原始"))
        repo.update_entry("e1", {"id": "hacked", "summary": "合法修改"})
        results = repo.list_entries()
        assert len(results) == 1
        assert results[0].summary == "合法修改"

    def test_delete_entry(self, repo):
        repo.upsert_entry(MemoryEntry(id="e1", type="fact", summary="待删除"))
        ok = repo.delete_entry("e1")
        assert ok
        assert len(repo.list_entries()) == 0

    def test_increment_hit(self, repo):
        repo.upsert_entry(MemoryEntry(id="e1", type="fact", summary="热门", hits=0))
        repo.upsert_entry(MemoryEntry(id="e2", type="fact", summary="冷门", hits=0))
        repo.increment_hit(["e1"])
        results = {e.id: e for e in repo.list_entries()}
        assert results["e1"].hits == 1
        assert results["e1"].last_hit_at is not None
        assert results["e2"].hits == 0

    def test_increment_hit_empty(self, repo):
        repo.increment_hit([])


class TestMeta:
    def test_set_and_get_meta(self, repo):
        repo.set_meta("theme", "dark")
        assert repo.get_meta("theme") == "dark"

    def test_get_meta_missing(self, repo):
        assert repo.get_meta("nonexistent") is None

    def test_set_meta_overwrite(self, repo):
        repo.set_meta("key1", "val1")
        repo.set_meta("key1", "val2")
        assert repo.get_meta("key1") == "val2"
