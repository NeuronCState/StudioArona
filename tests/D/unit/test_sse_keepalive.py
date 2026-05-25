"""Test SSE keepalive heartbeat injection in _stream_sse."""
import asyncio

import pytest


class MockByteStream:
    """Simulates an httpx byte stream."""

    def __init__(self, chunks: list[bytes]):
        self.chunks = list(chunks)
        self._pos = 0

    def aiter_bytes(self):
        return self

    async def __anext__(self) -> bytes:
        if self._pos >= len(self.chunks):
            raise StopAsyncIteration
        chunk = self.chunks[self._pos]
        self._pos += 1
        return chunk


class MockResponse:
    def __init__(self, stream):
        self._stream = stream

    async def __aenter__(self):
        return self._stream

    async def __aexit__(self, *args):
        pass


class MockClient:
    def stream(self, method, url, headers=None, content=None):
        return self._resp

    def set_response(self, resp):
        self._resp = resp


class MockRequest:
    def __init__(self, disconnected_after: int | None = None):
        self._count = 0
        self._disconnected_after = disconnected_after
        self.method = "GET"

    async def is_disconnected(self) -> bool:
        if self._disconnected_after is None:
            return False
        self._count += 1
        return self._count > self._disconnected_after


@pytest.mark.asyncio
async def test_keepalive_injected_on_timeout(monkeypatch):
    """Keepalive injected when asyncio.wait_for raises TimeoutError."""
    from app.proxy.forward import _KEEPALIVE, _stream_sse

    timeout_calls = 0
    orig_wait_for = asyncio.wait_for

    async def controlled_wait_for(coro, timeout):
        nonlocal timeout_calls
        timeout_calls += 1
        if timeout_calls == 2:
            raise asyncio.TimeoutError()
        return await orig_wait_for(coro, timeout)

    monkeypatch.setattr(asyncio, "wait_for", controlled_wait_for)

    mock_stream = MockByteStream([b"data: hello\n\n", b"data: world\n\n"])
    mock_client = MockClient()
    mock_client.set_response(MockResponse(mock_stream))
    mock_request = MockRequest()

    chunks = []
    async for chunk in _stream_sse(
        mock_client, mock_request, "http://test/stream", {}, b""
    ):
        chunks.append(chunk)

    assert len(chunks) == 3
    assert chunks[0] == b"data: hello\n\n"
    assert chunks[1] == _KEEPALIVE
    assert chunks[2] == b"data: world\n\n"


@pytest.mark.asyncio
async def test_no_keepalive_when_no_timeout(monkeypatch):
    """No keepalive injected when asyncio.wait_for never times out."""
    from app.proxy.forward import _KEEPALIVE, _stream_sse

    # No timeouts injected
    mock_stream = MockByteStream([b"data: a\n\n", b"data: b\n\n", b"data: c\n\n"])
    mock_client = MockClient()
    mock_client.set_response(MockResponse(mock_stream))
    mock_request = MockRequest()

    chunks = []
    async for chunk in _stream_sse(
        mock_client, mock_request, "http://test/stream", {}, b""
    ):
        chunks.append(chunk)

    assert len(chunks) == 3
    assert all(c != _KEEPALIVE for c in chunks)


@pytest.mark.asyncio
async def test_multiple_keepalives_on_repeated_timeouts(monkeypatch):
    """Multiple keepalives injected for repeated timeouts."""
    from app.proxy.forward import _KEEPALIVE, _stream_sse

    timeout_calls = 0
    orig_wait_for = asyncio.wait_for

    async def controlled_wait_for(coro, timeout):
        nonlocal timeout_calls
        timeout_calls += 1
        # Timeout on calls 2, 3, 4 (three timeouts before second chunk)
        if timeout_calls in (2, 3, 4):
            raise asyncio.TimeoutError()
        return await orig_wait_for(coro, timeout)

    monkeypatch.setattr(asyncio, "wait_for", controlled_wait_for)

    mock_stream = MockByteStream([b"data: first\n\n", b"data: last\n\n"])
    mock_client = MockClient()
    mock_client.set_response(MockResponse(mock_stream))
    mock_request = MockRequest()

    chunks = []
    async for chunk in _stream_sse(
        mock_client, mock_request, "http://test/stream", {}, b""
    ):
        chunks.append(chunk)

    assert len(chunks) == 5
    assert chunks[0] == b"data: first\n\n"
    assert chunks[1] == _KEEPALIVE
    assert chunks[2] == _KEEPALIVE
    assert chunks[3] == _KEEPALIVE
    assert chunks[4] == b"data: last\n\n"


@pytest.mark.asyncio
async def test_keepalive_format():
    """Keepalive must be a valid SSE comment: colon + space + text + double newline."""
    from app.proxy.forward import _KEEPALIVE

    assert _KEEPALIVE == b": keepalive\n\n"
    assert _KEEPALIVE.startswith(b":")


@pytest.mark.asyncio
async def test_client_disconnect_stops_stream():
    """Stream stops when client disconnects."""
    from app.proxy.forward import _stream_sse

    mock_stream = MockByteStream([b"data: 1\n\n", b"data: 2\n\n", b"data: 3\n\n"])
    mock_client = MockClient()
    mock_client.set_response(MockResponse(mock_stream))
    mock_request = MockRequest(disconnected_after=1)

    chunks = []
    async for chunk in _stream_sse(
        mock_client, mock_request, "http://test/stream", {}, b""
    ):
        chunks.append(chunk)

    assert len(chunks) == 1
    assert chunks[0] == b"data: 1\n\n"


@pytest.mark.asyncio
async def test_empty_stream_keepalive_loop(monkeypatch):
    """An empty stream continuously emits keepalives (one per timeout)."""
    from app.proxy.forward import _KEEPALIVE, _stream_sse

    timeout_calls = 0
    orig_wait_for = asyncio.wait_for

    async def controlled_wait_for(coro, timeout):
        nonlocal timeout_calls
        timeout_calls += 1
        if timeout_calls <= 3:
            raise asyncio.TimeoutError()
        # After 3 keepalives, let StopAsyncIteration through
        return await orig_wait_for(coro, timeout)

    monkeypatch.setattr(asyncio, "wait_for", controlled_wait_for)

    mock_stream = MockByteStream([])  # empty stream
    mock_client = MockClient()
    mock_client.set_response(MockResponse(mock_stream))
    mock_request = MockRequest()

    chunks = []
    async for chunk in _stream_sse(
        mock_client, mock_request, "http://test/stream", {}, b""
    ):
        chunks.append(chunk)

    # 3 keepalives, then stream ends
    assert len(chunks) == 3
    assert all(c == _KEEPALIVE for c in chunks)
