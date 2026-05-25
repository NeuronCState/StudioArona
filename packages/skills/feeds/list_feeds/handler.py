"""feeds/list_feeds Skill handler — list RSS feeds (maps to rss/list)."""

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
    if ctx.is_mock:
        return _mock_feeds()

    return Result(ok=False, error="RSS fetcher not available in dev mode")


def _mock_feeds() -> Result:
    return Result(ok=True, data={
        "feeds": [
            {"id": "f1", "title": "AI 前沿日报", "url": "https://example.com/ai", "unread": 3},
            {"id": "f2", "title": "技术博客聚合", "url": "https://example.com/tech", "unread": 12},
            {"id": "f3", "title": "工作室公告", "url": "https://example.com/studio", "unread": 0},
        ],
        "articles": [
            {"id": "a1", "feed_id": "f1", "title": "GPT-5 发布路线图曝光", "summary": "据消息人士透露...", "url": "https://example.com/a1", "published": "2026-05-21T08:00:00Z"},
            {"id": "a2", "feed_id": "f1", "title": "Claude 4.7 Opus 评测", "summary": "多项基准测试刷新 SOTA...", "url": "https://example.com/a2", "published": "2026-05-21T06:30:00Z"},
            {"id": "a3", "feed_id": "f2", "title": "Rust 2026 Edition 更新日志", "summary": "编译器性能提升 20%...", "url": "https://example.com/a3", "published": "2026-05-20T12:00:00Z"},
        ],
        "mock": True,
    })
