"""Unified JSON error response middleware."""

import uuid

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Catches unhandled exceptions and returns unified error JSON."""

    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception:
            trace_id = str(uuid.uuid4())[:8]
            return JSONResponse(
                status_code=500,
                content={
                    "code": "JAVIS_INTERNAL_ERROR",
                    "message": "服务器内部错误",
                    "trace_id": trace_id,
                },
            )
