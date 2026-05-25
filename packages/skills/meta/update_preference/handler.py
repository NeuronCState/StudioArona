"""meta.update_preference Skill handler — write user preference to memory."""

from __future__ import annotations

from dataclasses import dataclass
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
    key = inputs.get("key", "")
    value = inputs.get("value", "")

    if not user_id or not key:
        return Result(ok=False, error="user_id and key are required")

    if ctx.is_mock:
        return _mock_update(key, value)

    try:
        import httpx
        import uuid
        async with httpx.AsyncClient() as client:
            entry = {
                "id": str(uuid.uuid4()),
                "type": "preference",
                "summary": f"{key}: {value}"[:60],
                "detail": f"用户偏好: {key} = {value}",
                "importance": 80,
            }
            resp = await client.post(
                f"{ctx.gateway_url}/internal/memory/entries",
                json=entry,
            )
            resp.raise_for_status()
        return Result(ok=True, data={"stored": key, "value": value})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_update(key: str, value: str) -> Result:
    return Result(ok=True, data={"stored": key, "value": value, "mock": True})
