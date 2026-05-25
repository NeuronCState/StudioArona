"""face/identify Skill handler — identify user from face embedding.

Phase M3 mock: returns canned user_id with high confidence.
Mac phase with camera: calls FaceRecognizer.identify().
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    recognizer: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


async def handler(ctx: Context, **inputs: Any) -> Result:
    if ctx.is_mock:
        return _mock_identify()

    if ctx.recognizer is None:
        return Result(ok=False, error="Face recognizer not available")

    try:
        embedding = inputs.get("embedding")
        if embedding is None:
            return Result(ok=False, error="No face embedding provided")
        user_id, confidence = await ctx.recognizer.identify(embedding)
        return Result(ok=True, data={"user_id": user_id, "confidence": confidence})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_identify() -> Result:
    return Result(ok=True, data={
        "user_id": "mock-user-001",
        "confidence": 0.95,
        "display_name": "老张",
    })
