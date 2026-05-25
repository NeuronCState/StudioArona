"""nas.search Skill handler."""

from __future__ import annotations

import random
from dataclasses import dataclass
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
    {"name": "training-logs-bert.txt", "path": "/shared/logs/", "size_mb": 15.6, "user": "li"},
    {"name": "project-readme.md", "path": "/shared/projects/", "size_mb": 0.2, "user": "zhang"},
]


async def handler(ctx: Context, **inputs: Any) -> Result:
    query = inputs.get("query")
    limit = inputs.get("limit", 10)

    if not query:
        return Result(ok=False, error="query is required")

    if ctx.is_mock:
        return _mock_search(query, limit)

    if ctx.nas_client is None:
        return Result(ok=False, error="NAS client not available")

    try:
        items = await ctx.nas_client.search(query=query, limit=limit)
        return Result(ok=True, data={"items": items})
    except Exception as e:
        return Result(ok=False, error=str(e))


def _mock_search(query: str, limit: int) -> Result:
    query_lower = query.lower()
    matched = []
    for f in _MOCK_FILES:
        name_lower = f["name"].lower()
        # Simple substring match
        if query_lower in name_lower or query_lower in f["path"].lower():
            matched.append({**f, "relevance": round(random.uniform(0.7, 1.0), 2)})

    # If no exact match, return random subset with low relevance
    if not matched:
        matched = [
            {**f, "relevance": round(random.uniform(0.1, 0.4), 2)}
            for f in random.sample(_MOCK_FILES, min(3, len(_MOCK_FILES)))
        ]

    return Result(ok=True, data={"items": matched[:limit]})
