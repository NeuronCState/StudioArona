"""Unit tests for WebSocket hub."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.ws.hub import WSHub


@pytest.fixture
def hub():
    return WSHub()


@pytest.fixture
def mock_ws():
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    ws.accept = AsyncMock()
    return ws


class TestWSHub:
    @pytest.mark.asyncio
    async def test_connect_adds_connection(self, hub, mock_ws):
        await hub.connect(mock_ws, "user-1")
        assert hub._count() == 1
        assert "user-1" in hub._connections

    @pytest.mark.asyncio
    async def test_disconnect_removes_connection(self, hub, mock_ws):
        await hub.connect(mock_ws, "user-1")
        await hub.disconnect(mock_ws, "user-1")
        assert hub._count() == 0
        assert "user-1" not in hub._connections

    @pytest.mark.asyncio
    async def test_send_to_user(self, hub, mock_ws):
        await hub.connect(mock_ws, "user-1")
        await hub.send_to_user("user-1", {"type": "wake", "user_id": "user-1"})
        mock_ws.send_text.assert_called_once()
        import json
        sent = json.loads(mock_ws.send_text.call_args[0][0])
        assert sent["type"] == "wake"

    @pytest.mark.asyncio
    async def test_send_to_nonexistent_user(self, hub):
        # Should not raise
        await hub.send_to_user("nobody", {"type": "test"})

    @pytest.mark.asyncio
    async def test_broadcast(self, hub):
        ws1 = AsyncMock()
        ws1.send_text = AsyncMock()
        ws2 = AsyncMock()
        ws2.send_text = AsyncMock()

        await hub.connect(ws1, "user-1")
        await hub.connect(ws2, "user-2")

        await hub.broadcast({"type": "announcement"})
        ws1.send_text.assert_called_once()
        ws2.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_multiple_connections_per_user(self, hub):
        ws1 = AsyncMock()
        ws1.send_text = AsyncMock()
        ws2 = AsyncMock()
        ws2.send_text = AsyncMock()

        await hub.connect(ws1, "user-1")
        await hub.connect(ws2, "user-1")
        assert hub._count() == 2

        await hub.send_to_user("user-1", {"type": "test"})
        ws1.send_text.assert_called_once()
        ws2.send_text.assert_called_once()

    @pytest.mark.asyncio
    async def test_dead_connection_cleanup(self, hub):
        ws_good = AsyncMock()
        ws_good.send_text = AsyncMock()
        ws_bad = AsyncMock()
        ws_bad.send_text = AsyncMock(side_effect=Exception("connection dead"))

        await hub.connect(ws_good, "user-1")
        await hub.connect(ws_bad, "user-1")

        await hub.send_to_user("user-1", {"type": "test"})
        # Bad connection should be removed, good one stays
        assert hub._count() == 1
