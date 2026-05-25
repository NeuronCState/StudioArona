"""Audit log decorator and helper.

Usage:
    @audit_action("user.create")
    async def create_user(..., request: Request, ...):
        ...

Or manually:
    await write_audit_log(db, actor=user_id, action="user.create", target=target_id, ip=ip)
"""

import hashlib
import json
from collections.abc import Callable
from functools import wraps

import structlog
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog

logger = structlog.get_logger("audit")


async def write_audit_log(
    db: AsyncSession,
    actor: str,
    action: str,
    target: str | None = None,
    payload: dict | None = None,
    ip: str | None = None,
) -> None:
    """Write an entry to the audit_log table."""
    payload_hash = None
    if payload:
        payload_hash = hashlib.sha256(
            json.dumps(payload, sort_keys=True, default=str).encode()
        ).hexdigest()[:16]

    entry = AuditLog(
        actor=actor,
        action=action,
        target=target,
        payload_hash=payload_hash,
        ip=ip,
    )
    db.add(entry)
    await db.flush()
    logger.info("audit_written", actor=actor, action=action, target=target)


def audit_action(action: str):
    """Decorator that logs an audit entry after the endpoint executes.

    The decorated function must accept `request: Request` and `db: AsyncSession`.
    The current user is extracted from request.state.user_id (set by auth middleware).
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)

            # Extract audit info from kwargs
            request: Request | None = kwargs.get("request")
            db: AsyncSession | None = kwargs.get("db")

            if request and db:
                user_id = getattr(request.state, "user_id", None) or "anonymous"
                ip = request.client.host if request.client else None
                target = kwargs.get("target_id") or kwargs.get("user_id")
                payload = kwargs.get("body")
                if hasattr(payload, "model_dump"):
                    payload = payload.model_dump()

                await write_audit_log(
                    db=db,
                    actor=user_id,
                    action=action,
                    target=str(target) if target else None,
                    payload=payload,
                    ip=ip,
                )

            return result

        return wrapper

    return decorator
