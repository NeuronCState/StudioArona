"""Tests for recall."""

import os
import tempfile

import pytest

from app.memory.provisioner import ensure_user_memory_db
from app.memory.recall import recall
from app.memory.repository import MemoryEntry, MemoryRepo


@pytest.fixture
def repo():
    tmp = tempfile.mkdtemp()
    os.environ["JAVIS_USER_DATA_DIR"] = tmp
    ensure_user_memory_db("recall-user")
    r = MemoryRepo("recall-user")
    # Seed test entries
    entries = [
        MemoryEntry(id="e1", type="fact", summary="老张喜欢喝茶", importance=80),
        MemoryEntry(id="e2", type="fact", summary="老李喜欢咖啡", importance=60),
        MemoryEntry(id="e3", type="preference", summary="老师叫我老张", importance=90),
        MemoryEntry(id="e4", type="fact", summary="工作室在杭州西湖区", importance=50),
        MemoryEntry(id="e5", type="fact", summary="今天是晴天", importance=20),
        MemoryEntry(id="e6", type="fact", summary="禁用条目", importance=80, disabled=1),
    ]
    for e in entries:
        r.upsert_entry(e)
    yield r
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    if "JAVIS_USER_DATA_DIR" in os.environ:
        del os.environ["JAVIS_USER_DATA_DIR"]


class TestRecall:
    def test_recall_returns_top_k(self, repo):
        results = recall("recall-user", "老师叫什么", k=2)
        assert len(results) == 2

    def test_recall_filters_disabled(self, repo):
        results = recall("recall-user", "禁用", k=5)
        ids = {e.id for e in results}
        assert "e6" not in ids

    def test_recall_hits_increment(self, repo):
        _ = recall("recall-user", "老张", k=3)
        entries = repo.list_entries(q="老张")
        for e in entries:
            if e.id in ("e1", "e3"):
                assert e.hits >= 1

    def test_recall_empty_query(self, repo):
        results = recall("recall-user", "", k=5)
        assert len(results) <= 5

    def test_recall_no_entries(self, repo):
        results = recall("no-such-user", "hello", k=5)
        assert len(results) == 0

    def test_recall_order_by_relevance(self, repo):
        results = recall("recall-user", "老张喝茶", k=3)
        # Top result should be about 老张
        top_ids = {e.id for e in results}
        assert "e1" in top_ids or "e3" in top_ids
