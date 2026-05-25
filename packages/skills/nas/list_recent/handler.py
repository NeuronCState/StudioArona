"""nas.list_recent Skill handler."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass
class Context:
    is_mock: bool = False
    nas_client: Any = None


@dataclass
class Result:
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


_MOCK_FILES = [
    {"name": "project-final-v3.zip", "path": "/shared/projects/", "size_mb": 245.3, "user": "zhang"},
    {"name": "training-data-2026.tar.gz", "path": "/shared/datasets/", "size_mb": 1820.5, "user": "li"},
    {"name": "meeting-notes-0520.md", "path": "/shared/docs/", "size_mb": 0.1, "user": "wang"},
    {"name": "model-checkpoint-epoch50.pt", "path": "/shared/models/", "size_mb": 892.0, "user": "li"},
    {"name": "poster-draft.pdf", "path": "/shared/design/", "size_mb": 12.4, "user": "zhang"},
    {"name": "experiment-results.xlsx", "path": "/shared/data/", "size_mb": 3.2, "user": "chen"},
    {"name": "video-demo-cut.mp4", "path": "/shared/videos/", "size_mb": 456.7, "user": "wang"},
    {"name": "slides-defense.pptx", "path": "/shared/presentations/", "size_mb": 28.9, "user": "zhang"},
    {"name": "backup-2026-05-20.tar.gz", "path": "/shared/backups/", "size_mb": 2048.0, "user": "admin"},
    {"name": "readme-update.md", "path": "/shared/", "size_mb": 0.05, "user": "chen"},
    {"name": "dataset-v2-cleaned.csv", "path": "/shared/datasets/", "size_mb": 156.8, "user": "li"},
    {"name": "photo-lab-0520.jpg", "path": "/shared/photos/", "size_mb": 4.5, "user": "wang"},
]


async def handler(ctx: Context, **inputs: Any) -> Result:
    limit = inputs.get("limit", 10)
    user_id = inputs.get("user_id")

    if ctx.is_mock:
        return _mock_list(limit, user_id)

    if ctx.nas_client is None:
        return Result(ok=False, error="NAS client not available")

    try:
        items = await ctx.nas_client.list_recent(limit=limit, user_id=user_id)
        return Result(ok=True, data={"items": items})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_list(limit: int, user_id: str | None) -> Result:
    now = datetime.now(timezone.utc)
    items = []
    for i, f in enumerate(_MOCK_FILES[:limit]):
        if user_id and f["user"] != user_id:
            continue
        items.append({
            **f,
            "modified_at": (now - timedelta(hours=random.randint(1, 72))).isoformat(),
        })
    return Result(ok=True, data={"items": items})
