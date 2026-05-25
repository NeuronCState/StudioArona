"""Redis-based token bucket rate limiter.

Two tiers:
- Anonymous: 60 requests/minute
- Authenticated: 120 requests/minute

Uses sliding window counter in Redis.
"""

import time

import redis.asyncio as redis
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

# Rate limit config
LIMITS = {
    "anonymous": 60,      # requests per minute
    "authenticated": 120,
}
WINDOW_SECONDS = 60


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, redis_url: str | None = None):
        super().__init__(app)
        self._redis_url = redis_url or settings.REDIS_URL
        self._redis: redis.Redis | None = None

    async def _get_redis(self) -> redis.Redis:
        if self._redis is None:
            self._redis = redis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health check
        if request.url.path == "/health":
            return await call_next(request)

        # Determine client identity
        auth_header = request.headers.get("authorization", "")
        is_authenticated = auth_header.startswith("Bearer ")
        tier = "authenticated" if is_authenticated else "anonymous"
        limit = LIMITS[tier]

        # Build rate limit key
        if is_authenticated:
            # Use token hash for authenticated users
            client_id = f"rl:{tier}:{auth_header[7:20]}"
        else:
            client_id = f"rl:{tier}:{request.client.host if request.client else 'unknown'}"

        try:
            r = await self._get_redis()
            now = int(time.time())
            window_key = f"{client_id}:{now // WINDOW_SECONDS}"

            # Increment counter
            count = await r.incr(window_key)
            if count == 1:
                await r.expire(window_key, WINDOW_SECONDS)

            if count > limit:
                retry_after = WINDOW_SECONDS - (now % WINDOW_SECONDS)
                return JSONResponse(
                    status_code=429,
                    content={
                        "code": "JAVIS_RATE_LIMITED",
                        "message": f"请求过于频繁，请 {retry_after} 秒后重试",
                    },
                    headers={"Retry-After": str(retry_after)},
                )

            response = await call_next(request)
            # Add rate limit headers
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(max(0, limit - count))
            response.headers["X-RateLimit-Reset"] = str(
                (now // WINDOW_SECONDS + 1) * WINDOW_SECONDS
            )
            return response

        except Exception:
            # Redis down — fail open, don't block requests
            return await call_next(request)
