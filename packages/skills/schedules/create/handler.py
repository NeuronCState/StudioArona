"""schedules/create Skill handler — add a new schedule (schedules/add)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Context:
    is_mock: bool = False


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    title = inputs.get("title", "")
    due_at = inputs.get("due_at", "")
    body = inputs.get("body", "")

    if not title:
        return Result(ok=False, error="title is required")

    if ctx.is_mock:
        return _mock_create(title, due_at, body)

    return Result(ok=False, error="Schedule backend not available in dev mode")


def _mock_create(title: str, due_at: str, body: str) -> Result:
    import uuid
    return Result(ok=True, data={
        "schedule": {
            "id": f"sc-{uuid.uuid4().hex[:8]}",
            "title": title,
            "due_at": due_at,
            "body": body,
            "created_by_agent": True,
        },
        "mock": True,
    })
