"""Shared fixtures for api-gateway tests.

Uses SQLite in-memory for fast tenant-isolation testing.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models.base import Base
from app.models.schedule import Schedule
from app.models.feed import Feed, FeedItem
from app.models.memory import MemoryEntry
from app.models.vm import Vm


def _uid() -> str:
    return str(uuid.uuid4())


@pytest.fixture(scope="session")
def engine():
    """Session-scoped SQLite in-memory engine."""
    return create_engine("sqlite:///:memory:", echo=False)


@pytest.fixture(scope="session")
def tables(engine):
    """Create all tables once per session."""
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def session(engine, tables):
    """Per-test transaction-scoped session (rollback after each test)."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def user_a_id() -> str:
    return _uid()


@pytest.fixture
def user_b_id() -> str:
    return _uid()


# ── Seed helpers ──────────────────────────────────────────────────


@pytest.fixture
def seed_schedule(session, user_a_id):
    """Insert a schedule for user_a, return its id."""
    s = Schedule(
        user_id=user_a_id,
        title="User A's meeting",
        body="Discuss Q2 roadmap",
        starts_at=datetime(2026, 5, 25, 10, 0, tzinfo=timezone.utc),
        ends_at=datetime(2026, 5, 25, 11, 0, tzinfo=timezone.utc),
        status="pending",
        source="manual",
    )
    session.add(s)
    session.flush()
    return s.id


@pytest.fixture
def seed_feed(session, user_a_id):
    """Insert a feed for user_a, return its id."""
    f = Feed(
        user_id=user_a_id,
        url="https://example.com/rss",
        title="User A's feed",
        enabled=True,
    )
    session.add(f)
    session.flush()
    return f.id


@pytest.fixture
def seed_feed_item(session, seed_feed):
    """Insert a feed_item into user_a's feed, return dict with both ids."""
    fi = FeedItem(
        feed_id=seed_feed,
        guid="http://example.com/item-1",
        title="Test Item",
        link="http://example.com/item-1",
        summary="A test feed item.",
        published_at=datetime(2026, 5, 22, tzinfo=timezone.utc),
    )
    session.add(fi)
    session.flush()
    return {"feed_id": seed_feed, "item_id": fi.id}


@pytest.fixture
def seed_memory_entry(session, user_a_id):
    """Insert a memory_entry for user_a, return its id."""
    m = MemoryEntry(
        user_id=user_a_id,
        kind="preference",
        content="User A likes lattes.",
        tags=["drink", "preference"],
        weight=1.0,
    )
    session.add(m)
    session.flush()
    return m.id


@pytest.fixture
def seed_vm(session, user_a_id):
    """Insert a vm for user_a, return its id."""
    v = Vm(
        user_id=user_a_id,
        name="vm-build",
        hypervisor="mock",
        spec_cpu=4,
        spec_ram_mb=8192,
        spec_disk_gb=50,
        status="running",
        guest_agent_ok=True,
        exec_enabled=True,
    )
    session.add(v)
    session.flush()
    return v.id
