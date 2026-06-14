"""Internal HTTP endpoint: /internal/notify/rss

RSS Fetcher / Web Watcher (Node.js sidecar processes) call this when they
insert new feed_items, and we dispatch an email to the feed's owner.

Security: localhost-only. The rss-fetcher / web-watcher run on the same
host and are the only clients.

POST /internal/notify/rss
{
  "user_id": "<uuid>",
  "items": [
    {"title": "...", "link": "...", "summary": "...", "published": "..."}
  ]
}

Debounce: per-user, we only send at most 1 email per RSS_NOTIFY_DEBOUNCE_MIN
(default 10 min). If a new request comes inside the window, the items are
appended to a pending list and the NEXT request (or the next scheduled
flush) sends the combined digest.
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass, field

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.user import User
from app.notifier.email import scheduler

logger = structlog.get_logger("internal-notify-rss")

router = APIRouter(prefix="/internal/notify", tags=["Internal-Notify"])

DEBOUNCE_SEC = int(__import__("os").getenv("RSS_NOTIFY_DEBOUNCE_SEC", "300"))  # 5 min


@dataclass
class _Pending:
    user_id: str
    items: list[dict] = field(default_factory=list)
    last_sent_at: float = 0.0  # unix timestamp
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

# user_id -> _Pending
_pending: dict[str, _Pending] = {}
_global_lock = asyncio.Lock()


class RssNotifyRequest(BaseModel):
    user_id: str
    items: list[dict]


@router.post("/rss")
async def notify_rss(body: RssNotifyRequest, request: Request):
    """Send (or queue) an RSS update email to one user.

    Inside the debounce window: queue items; the next call after the window
    flushes everything in one digest. This keeps users from being spammed
    when rss-fetcher (5min) and web-watcher (5min) both fire close together.
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="internal endpoint only")

    if not body.items:
        return {"ok": True, "skipped": "no_items"}

    async with _global_lock:
        p = _pending.setdefault(body.user_id, _Pending(user_id=body.user_id))

    now = time.time()
    async with p.lock:
        p.items.extend(body.items)
        elapsed = now - p.last_sent_at
        # 第一次（last_sent_at=0）直接发
        # 否则只在过了 debounce window 才发
        if p.last_sent_at > 0 and elapsed < DEBOUNCE_SEC:
            logger.info("rss_notify_debounced", user_id=body.user_id,
                        pending=len(p.items), wait=int(DEBOUNCE_SEC - elapsed))
            return {"ok": True, "deferred": True, "pending": len(p.items)}

        items_to_send = p.items[:]
        p.items = []
        p.last_sent_at = now

    # 拿到 user email（异步）
    async with async_session_factory() as db:
        u = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
        if not u:
            return {"ok": False, "error": "user_not_found"}
        if not u.email:
            return {"ok": True, "skipped": "no_email"}
        await scheduler.rss_update(
            items_to_send,
            {"id": u.id, "email": u.email, "display_name": u.display_name},
        )
    logger.info("rss_notify_sent", user_id=body.user_id, n=len(items_to_send))
    return {"ok": True, "sent": len(items_to_send)}


@router.get("/rss/pending")
async def notify_rss_pending():
    """Diagnostic: how many items are pending per user (deferred by debounce)."""
    out = []
    for uid, p in _pending.items():
        out.append({
            "user_id": uid,
            "pending_items": len(p.items),
            "last_sent_at": p.last_sent_at,
            "seconds_since_last": int(time.time() - p.last_sent_at) if p.last_sent_at else None,
        })
    return {"debounce_sec": DEBOUNCE_SEC, "users": out}
