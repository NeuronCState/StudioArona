"""Unit tests for EventPublisher."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.ws.publisher import EventPublisher


@pytest.fixture
def publisher():
    return EventPublisher()


@pytest.fixture
async def connected_publisher():
    pub = EventPublisher(gateway_url="http://test-gateway:8080")
    await pub.connect()
    yield pub
    await pub.disconnect()


@pytest.mark.asyncio
async def test_connect(publisher):
    await publisher.connect()
    assert publisher._connected is True
    assert publisher._client is not None


@pytest.mark.asyncio
async def test_disconnect(publisher):
    await publisher.connect()
    await publisher.disconnect()
    assert publisher._connected is False
    assert publisher._client is None


@pytest.mark.asyncio
async def test_publish_without_connect_does_not_crash(publisher):
    await publisher.publish({"type": "test", "data": "hello"})


@pytest.mark.asyncio
async def test_wake_without_connect_does_not_crash(publisher):
    await publisher.wake(user_id="alice", confidence=0.92)


@pytest.mark.asyncio
async def test_leave_without_connect_does_not_crash(publisher):
    await publisher.leave(duration_ms=1200)


@pytest.mark.asyncio
async def test_face_track_without_connect_does_not_crash(publisher):
    await publisher.face_track(x=0.5, y=0.3, size=0.1)


@pytest.mark.asyncio
async def test_metrics_update_without_connect_does_not_crash(publisher):
    await publisher.metrics_update({"ts": "2026-01-01", "cpu_cores": []})


@pytest.mark.asyncio
async def test_screen_changed_without_connect_does_not_crash(publisher):
    await publisher.screen_changed(orientation="portrait")


# ── HTTP integration tests (mock httpx client) ─────────────────


@pytest.mark.asyncio
async def test_publish_posts_to_broadcast_endpoint(connected_publisher):
    mock_response = AsyncMock()
    mock_response.status_code = 200
    connected_publisher._client.post = AsyncMock(return_value=mock_response)

    await connected_publisher.publish({"type": "face_track", "x": 0.5, "y": 0.3, "size": 0.1})

    connected_publisher._client.post.assert_called_once_with(
        "http://test-gateway:8080/internal/events/broadcast",
        json={"event": {"type": "face_track", "x": 0.5, "y": 0.3, "size": 0.1}},
    )


@pytest.mark.asyncio
async def test_wake_posts_to_publish_endpoint(connected_publisher):
    mock_response = AsyncMock()
    mock_response.status_code = 200
    connected_publisher._client.post = AsyncMock(return_value=mock_response)

    await connected_publisher.wake(user_id="u_zhang", confidence=0.92)

    connected_publisher._client.post.assert_called_once_with(
        "http://test-gateway:8080/internal/events/publish",
        json={
            "user_id": "u_zhang",
            "event": {"type": "wake", "user_id": "u_zhang", "confidence": 0.92},
        },
    )


@pytest.mark.asyncio
async def test_broadcast_events_use_broadcast_endpoint(connected_publisher):
    mock_response = AsyncMock()
    mock_response.status_code = 200
    connected_publisher._client.post = AsyncMock(return_value=mock_response)

    await connected_publisher.leave(duration_ms=5000)

    connected_publisher._client.post.assert_called_once_with(
        "http://test-gateway:8080/internal/events/broadcast",
        json={"event": {"type": "leave", "duration_ms": 5000}},
    )
