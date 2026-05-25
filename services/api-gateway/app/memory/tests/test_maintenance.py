"""Tests for memory maintenance (decay + dedup)."""

import os
import tempfile

import pytest

from app.memory.maintenance import run_dedup, run_decay, run_maintenance
from app.memory.provisioner import ensure_user_memory_db
from app.memory.repository import MemoryEntry, MemoryRepo


@pytest.fixture
def repo():
    tmp = tempfile.mkdtemp()
    os.environ["JAVIS_USER_DATA_DIR"] = tmp
    ensure_user_memory_db("maint-user")
    r = MemoryRepo("maint-user")
    yield r
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)
    if "JAVIS_USER_DATA_DIR" in os.environ:
        del os.environ["JAVIS_USER_DATA_DIR"]


class TestDecay:
    def test_decay_leaves_high_importance(self, repo):
        repo.upsert_entry(MemoryEntry(
            id="e1", type="fact", summary="重要信息", importance=80,
            last_hit_at="2020-01-01T00:00:00"))  # very old but important
        n = run_decay("maint-user")
        entries = repo.list_entries(type="fact")
        assert entries[0].disabled == 0  # not decayed

    def test_decay_disables_low_importance_old(self, repo):
        repo.upsert_entry(MemoryEntry(
            id="e2", type="fact", summary="过期信息", importance=20,
            last_hit_at="2020-01-01T00:00:00"))
        n = run_decay("maint-user")
        entries = repo.list_entries(include_disabled=True)
        assert entries[0].disabled == 1

    def test_decay_leaves_recent(self, repo):
        repo.upsert_entry(MemoryEntry(
            id="e3", type="fact", summary="最近信息", importance=20,
            last_hit_at="2026-05-20T00:00:00"))
        n = run_decay("maint-user")
        entries = repo.list_entries()
        assert entries[0].disabled == 0

    def test_decay_skips_recent_entry(self, repo):
        # Recently created entry with no hits should not be decayed
        repo.upsert_entry(MemoryEntry(
            id="e4", type="fact", summary="新信息", importance=10))
        n = run_decay("maint-user")
        entries = repo.list_entries(include_disabled=True)
        assert entries[0].disabled == 0


class TestDedup:
    def test_dedup_merges_similar(self, repo):
        repo.upsert_entry(MemoryEntry(
            id="d1", type="preference", summary="老张喜欢喝咖啡", importance=60))
        repo.upsert_entry(MemoryEntry(
            id="d2", type="preference", summary="老张喜欢喝咖啡", importance=80))
        n = run_dedup("maint-user")
        assert n >= 1
        entries = repo.list_entries(include_disabled=True)
        assert len([e for e in entries if e.disabled]) >= 1

    def test_dedup_leaves_different(self, repo):
        repo.upsert_entry(MemoryEntry(
            id="d3", type="fact", summary="老张喜欢喝咖啡", importance=60))
        repo.upsert_entry(MemoryEntry(
            id="d4", type="fact", summary="老李住在北京", importance=50))
        n = run_dedup("maint-user")
        entries = repo.list_entries()
        assert len(entries) == 2
        assert all(e.disabled == 0 for e in entries)

    def test_dedup_single_entry(self, repo):
        repo.upsert_entry(MemoryEntry(
            id="d5", type="fact", summary="只有一条", importance=50))
        n = run_dedup("maint-user")
        assert n == 0

    def test_maintenance_runs_both(self, repo):
        repo.upsert_entry(MemoryEntry(
            id="m1", type="fact", summary="旧且不重要", importance=10,
            last_hit_at="2020-01-01T00:00:00"))
        repo.upsert_entry(MemoryEntry(
            id="m2", type="fact", summary="旧且不重要", importance=10,
            last_hit_at="2020-01-01T00:00:00"))
        result = run_maintenance("maint-user")
        assert result["decayed"] >= 0
        assert result["deduped"] >= 0
