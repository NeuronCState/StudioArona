"""meta.recall_memory Skill handler — recall per-user memory entries."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    gateway_url: str = "http://localhost:8080"


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    user_id = inputs.get("user_id", "")
    query = inputs.get("query", "")
    k = inputs.get("k", 5)

    if ctx.is_mock:
        return _mock_recall(query)

    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ctx.gateway_url}/internal/memory/recall",
                params={"user_id": user_id, "query": query, "k": k},
            )
            resp.raise_for_status()
            entries = resp.json()
        return Result(ok=True, data={"entries": entries})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_recall(query: str) -> Result:
    entries = [
        {
            "id": "mock-e1",
            "type": "fact",
            "summary": "老师喜欢在下午喝茶",
            "importance": 70,
        },
        {
            "id": "mock-e2",
            "type": "preference",
            "summary": "喜欢被叫老张",
            "importance": 80,
        },
    ]
    if query:
        entries = [e for e in entries if query in e["summary"]]
    return Result(ok=True, data={"entries": entries})
