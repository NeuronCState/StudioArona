"""feeds/summarize_item Skill handler — AI-summarize an RSS article (rss/fetch)."""

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
    url = inputs.get("url", inputs.get("article_id", ""))

    if ctx.is_mock:
        return _mock_summary(url)

    return Result(ok=False, error="AI summarizer not available in dev mode")


def _mock_summary(url: str) -> Result:
    return Result(ok=True, data={
        "article_id": url or "a1",
        "title": "GPT-5 发布路线图曝光",
        "summary": "OpenAI 计划在 2026 Q3 发布 GPT-5，参数规模预计达到 10T。新模型将在多模态推理和代码生成方面有显著提升。",
        "key_points": [
            "预计 2026 Q3 发布",
            "参数规模约 10T",
            "多模态推理能力大幅提升",
        ],
        "reading_time_min": 2,
        "mock": True,
    })
