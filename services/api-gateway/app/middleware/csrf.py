"""CSRF protection via double-submit cookie pattern.

Flow:
1. On login, server sets a CSRF token in a cookie (not HttpOnly)
2. Client reads cookie and sends token in X-CSRF-Token header on state-changing requests
3. Server validates header matches cookie

Safe methods (GET/HEAD/OPTIONS) are exempt.
"""

import secrets

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip CSRF for safe methods
        if request.method in SAFE_METHODS:
            return await call_next(request)

        # Skip CSRF for internal endpoints
        if request.url.path.startswith("/internal/"):
            return await call_next(request)

        # Skip CSRF for auth endpoints (login/register don't have cookie yet)
        if request.url.path.startswith("/api/auth/"):
            return await call_next(request)

        # Skip CSRF for speech API (audio elements can't set headers)
        if request.url.path.startswith("/api/speech/"):
            return await call_next(request)

        # Skip CSRF for WebSocket
        if request.url.path == "/ws/events":
            return await call_next(request)

        # Skip CSRF for JWT Bearer-authenticated API requests
        if request.headers.get("Authorization", "").startswith("Bearer "):
            return await call_next(request)

        # Validate double-submit cookie
        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        header_token = request.headers.get(CSRF_HEADER_NAME)

        if not cookie_token or not header_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "JAVIS_CSRF_MISSING", "message": "CSRF token 缺失"},
            )

        if not secrets.compare_digest(cookie_token, header_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "JAVIS_CSRF_INVALID", "message": "CSRF token 不匹配"},
            )

        return await call_next(request)


def generate_csrf_token() -> str:
    """Generate a new CSRF token."""
    return secrets.token_urlsafe(32)
