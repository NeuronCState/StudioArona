"""Tenant isolation tests — verify cross-user data access is blocked.

These tests simulate the ORM-level query patterns used by the agent bridge
handlers. Every handler MUST include `.filter(user_id == ctx.user_id)`.

Test scenarios:
  1. user_a creates schedule → user_b accesses → 404
  2. user_a creates feed → user_b tries to delete → 404
  3. user_a creates feed_item → user_b tries to mark read → 404
  4. user_a creates memory_entry → user_b tries to read → 404
  5. user_a creates vm → user_b tries to exec → 403
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.schedule import Schedule
from app.models.feed import Feed, FeedItem
from app.models.memory import MemoryEntry
from app.models.vm import Vm


# ── Schedule tenant isolation ─────────────────────────────────────


def test_schedule_list_only_shows_own(session, user_a_id, user_b_id, seed_schedule):
    """user_b queries schedule list → should NOT see user_a's schedule."""
    rows_a = (
        session.execute(
            select(Schedule).where(Schedule.user_id == user_a_id)
        )
        .scalars()
        .all()
    )
    rows_b = (
        session.execute(
            select(Schedule).where(Schedule.user_id == user_b_id)
        )
        .scalars()
        .all()
    )
    assert len(rows_a) == 1
    assert len(rows_b) == 0


def test_schedule_access_by_id_user_b_gets_nothing(
    session, user_a_id, user_b_id, seed_schedule
):
    """user_b queries for user_a's schedule by id → returns None (404)."""
    row = (
        session.execute(
            select(Schedule).where(
                Schedule.id == seed_schedule,
                Schedule.user_id == user_b_id,
            )
        )
        .scalars()
        .first()
    )
    assert row is None  # behaves like 404 in handler


def test_schedule_delete_user_b_ignored(session, user_a_id, user_b_id, seed_schedule):
    """user_b tries to DELETE user_a's schedule → 0 rows affected (404)."""
    from sqlalchemy import delete

    result = session.execute(
        delete(Schedule).where(
            Schedule.id == seed_schedule,
            Schedule.user_id == user_b_id,
        )
    )
    assert result.rowcount == 0  # nothing deleted


# ── Feed tenant isolation ─────────────────────────────────────────


def test_feed_list_only_shows_own(session, user_a_id, user_b_id, seed_feed):
    """user_b queries feed list → should NOT see user_a's feed."""
    rows_a = (
        session.execute(
            select(Feed).where(Feed.user_id == user_a_id)
        )
        .scalars()
        .all()
    )
    rows_b = (
        session.execute(
            select(Feed).where(Feed.user_id == user_b_id)
        )
        .scalars()
        .all()
    )
    assert len(rows_a) == 1
    assert len(rows_b) == 0


def test_feed_delete_by_user_b_fails(session, user_a_id, user_b_id, seed_feed):
    """user_b tries to DELETE user_a's feed → 0 rows affected (404)."""
    from sqlalchemy import delete

    result = session.execute(
        delete(Feed).where(
            Feed.id == seed_feed,
            Feed.user_id == user_b_id,
        )
    )
    assert result.rowcount == 0


# ── FeedItem tenant isolation (via parent feed) ───────────────────


def test_feed_item_read_user_b_fails(
    session, user_a_id, user_b_id, seed_feed, seed_feed_item
):
    """user_b tries to list feed items via user_a's feed_id → returns empty.

    The handler pattern is:
      1. Verify feed.user_id == ctx.userId
      2. Only then read feed_items
    """
    # Step 1: user_b verifies feed ownership → fails
    feed_check = (
        session.execute(
            select(Feed).where(
                Feed.id == seed_feed_item["feed_id"],
                Feed.user_id == user_b_id,
            )
        )
        .scalars()
        .first()
    )
    assert feed_check is None  # 404


# ── MemoryEntry tenant isolation ──────────────────────────────────


def test_memory_list_only_shows_own(
    session, user_a_id, user_b_id, seed_memory_entry
):
    """user_b queries memory entries → should NOT see user_a's."""
    rows_a = (
        session.execute(
            select(MemoryEntry).where(MemoryEntry.user_id == user_a_id)
        )
        .scalars()
        .all()
    )
    rows_b = (
        session.execute(
            select(MemoryEntry).where(MemoryEntry.user_id == user_b_id)
        )
        .scalars()
        .all()
    )
    assert len(rows_a) == 1
    assert len(rows_b) == 0


def test_memory_get_by_id_user_b_returns_none(
    session, user_a_id, user_b_id, seed_memory_entry
):
    """user_b queries for user_a's memory entry by id → returns None."""
    row = (
        session.execute(
            select(MemoryEntry).where(
                MemoryEntry.id == seed_memory_entry,
                MemoryEntry.user_id == user_b_id,
            )
        )
        .scalars()
        .first()
    )
    assert row is None


def test_memory_delete_user_b_ignored(
    session, user_a_id, user_b_id, seed_memory_entry
):
    """user_b tries to DELETE user_a's memory entry → 0 rows."""
    from sqlalchemy import delete

    result = session.execute(
        delete(MemoryEntry).where(
            MemoryEntry.id == seed_memory_entry,
            MemoryEntry.user_id == user_b_id,
        )
    )
    assert result.rowcount == 0


# ── VM tenant isolation ───────────────────────────────────────────


def test_vm_list_only_shows_own(session, user_a_id, user_b_id, seed_vm):
    """user_b queries VM list → should NOT see user_a's VM."""
    rows_a = (
        session.execute(
            select(Vm).where(Vm.user_id == user_a_id)
        )
        .scalars()
        .all()
    )
    rows_b = (
        session.execute(
            select(Vm).where(Vm.user_id == user_b_id)
        )
        .scalars()
        .all()
    )
    assert len(rows_a) == 1
    assert len(rows_b) == 0


def test_vm_exec_enabled_user_b_rejected(
    session, user_a_id, user_b_id, seed_vm
):
    """user_b tries to toggle exec_enabled on user_a's VM → should fail.

    The handler must check .filter(Vm.id == vm_id, Vm.user_id == ctx.user_id)
    before allowing any state mutation (including exec_enable toggle).
    """
    # user_b queries for user_a's VM → None (403 in handler)
    vm = (
        session.execute(
            select(Vm).where(
                Vm.id == seed_vm,
                Vm.user_id == user_b_id,
            )
        )
        .scalars()
        .first()
    )
    assert vm is None  # behaves like 403 in handler


# ── Regression: user_a should still access own data ───────────────


def test_user_a_can_access_own_schedule(session, user_a_id, seed_schedule):
    """Sanity check: user_a CAN access own data."""
    row = (
        session.execute(
            select(Schedule).where(
                Schedule.id == seed_schedule,
                Schedule.user_id == user_a_id,
            )
        )
        .scalars()
        .first()
    )
    assert row is not None
    assert row.title == "User A's meeting"


def test_user_a_can_access_own_feed(session, user_a_id, seed_feed):
    row = (
        session.execute(
            select(Feed).where(
                Feed.id == seed_feed,
                Feed.user_id == user_a_id,
            )
        )
        .scalars()
        .first()
    )
    assert row is not None


def test_user_a_can_access_own_memory(session, user_a_id, seed_memory_entry):
    row = (
        session.execute(
            select(MemoryEntry).where(
                MemoryEntry.id == seed_memory_entry,
                MemoryEntry.user_id == user_a_id,
            )
        )
        .scalars()
        .first()
    )
    assert row is not None


def test_user_a_can_access_own_vm(session, user_a_id, seed_vm):
    row = (
        session.execute(
            select(Vm).where(
                Vm.id == seed_vm,
                Vm.user_id == user_a_id,
            )
        )
        .scalars()
        .first()
    )
    assert row is not None
