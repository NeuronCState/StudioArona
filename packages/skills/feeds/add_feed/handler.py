"""feeds/add_feed Skill handler — subscribe to a new RSS feed."""

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
    url = inputs.get("url", "")
    title = inputs.get("title", "")

    if not url:
        return Result(ok=False, error="url is required")

    if ctx.is_mock:
        return _mock_add(url, title)

    return Result(ok=False, error="Feed backend not available in dev mode")


def _mock_add(url: str, title: str) -> Result:
    import uuid
    return Result(ok=True, data={
        "feed": {
            "id": f"f-{uuid.uuid4().hex[:8]}",
            "url": url,
            "title": title or url,
            "scope": "shared",
        },
        "mock": True,
    })
