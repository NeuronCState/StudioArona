"""HTTP proxy: forwards requests from gateway to downstream services.

Supports:
- Regular HTTP forwarding
- SSE streaming with keepalive injection (every 15s)
- Automatic cleanup on client disconnect
"""

import asyncio

import httpx
import structlog
from fastapi import Request
from fastapi.responses import Response, StreamingResponse

logger = structlog.get_logger("proxy")

# Service URL map — configurable via env
import os

SERVICE_URLS: dict[str, str] = {
    "agent": os.environ.get("AGENT_URL", "http://localhost:18790"),
    "perception": os.environ.get("PERCEPTION_URL", "http://localhost:8002"),
    "llm_gateway": os.environ.get("LLM_GATEWAY_SERVICE_URL", "http://localhost:8645"),
}

# Paths that should be proxied to each service
AGENT_PREFIXES = ("/api/chat", "/api/feeds", "/api/schedules")
PERCEPTION_PREFIXES = ("/api/system", "/api/vms", "/api/network", "/api/speech")
# LLM Gateway (services/llm_gateway/main.py) — OpenAI-compatible /v1/* + per-user
# routes for skills/memory/sessions
LLM_GATEWAY_PREFIXES = ("/api/v1",)

# Hop-by-hop headers to strip
_HOP_BY_HOP = {"host", "transfer-encoding", "connection", "keep-alive", "te"}

# Shared client (connection pooling)
_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=300.0))
    return _client


def resolve_service(path: str) -> str | None:
    """Determine which downstream service handles this path."""
    for prefix in LLM_GATEWAY_PREFIXES:
        if path.startswith(prefix):
            return "llm_gateway"
    for prefix in AGENT_PREFIXES:
        if path.startswith(prefix):
            return "agent"
    for prefix in PERCEPTION_PREFIXES:
        if path.startswith(prefix):
            return "perception"
    return None


def _forward_headers(request: Request) -> dict[str, str]:
    """Extract headers to forward, injecting user info from JWT."""
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    if hasattr(request.state, "user_id"):
        headers["X-Arona-User"] = request.state.user_id
        headers["X-Arona-Role"] = getattr(request.state, "user_role", "member")
    return headers


async def forward_to(
    service: str,
    path: str,
    request: Request,
) -> Response:
    """Forward an incoming request to a downstream service."""
    base_url = SERVICE_URLS.get(service)
    if base_url is None:
        return Response(
            content=b'{"code":"ARONA_BAD_GATEWAY","message":"unknown service"}',
            status_code=502,
            media_type="application/json",
        )

    url = f"{base_url}/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = _forward_headers(request)
    body = await request.body()
    # Preserve original Content-Type for multipart/file uploads
    if "content-type" in request.headers:
        headers["content-type"] = request.headers["content-type"]

    client = await _get_client()

    try:
        resp = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=body,
        )
    except httpx.ConnectError:
        logger.warning("service_down", service=service, url=url)
        return Response(
            content=f'{{"code":"ARONA_SERVICE_DOWN","message":"{service} 服务不可用"}}'.encode(),
            status_code=503,
            media_type="application/json",
        )
    except httpx.TimeoutException:
        logger.warning("gateway_timeout", service=service, url=url)
        return Response(
            content=f'{{"code":"ARONA_GATEWAY_TIMEOUT","message":"{service} 超时"}}'.encode(),
            status_code=504,
            media_type="application/json",
        )

    content_type = resp.headers.get("content-type", "")

    # SSE: stream with keepalive
    if "text/event-stream" in content_type:
        return StreamingResponse(
            content=_stream_sse(client, request, url, headers, body),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",  # disable Nginx buffering
            },
        )

    # Regular response
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=content_type,
        headers={k: v for k, v in resp.headers.items() if k.lower() not in _HOP_BY_HOP},
    )


_KEEPALIVE = b": keepalive\n\n"
_KEEPALIVE_INTERVAL = 15  # seconds


async def _stream_sse(
    client: httpx.AsyncClient,
    request: Request,
    url: str,
    headers: dict,
    body: bytes,
):
    """Yield SSE events from downstream, injecting keepalive every 15s.

    On client disconnect, the generator is closed automatically by FastAPI.
    """
    try:
        async with client.stream(request.method, url, headers=headers, content=body) as resp:
            stream = resp.aiter_bytes()
            while True:
                try:
                    chunk = await asyncio.wait_for(
                        stream.__anext__(),
                        timeout=_KEEPALIVE_INTERVAL,
                    )
                    if await request.is_disconnected():
                        logger.info("client_disconnected", url=url)
                        break
                    yield chunk
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        logger.info("client_disconnected", url=url)
                        break
                    yield _KEEPALIVE
                    logger.debug("sse_keepalive_sent", url=url)
                except StopAsyncIteration:
                    break
    except httpx.ReadError:
        logger.info("upstream_closed", url=url)
    except Exception:
        logger.exception("sse_stream_error", url=url)


async def close_client():
    """Shutdown hook: close the shared HTTP client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
