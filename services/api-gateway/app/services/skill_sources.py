"""Multi-source skill search aggregation."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

import httpx


@dataclass
class SkillResult:
    slug: str
    name: str
    description: str
    source: str  # skillsmp, skillhub, github
    source_url: str
    description_zh: str = ""
    author: str = ""
    stars: int = 0
    tags: list[str] = field(default_factory=list)
    category: str = ""
    downloaded: bool = False


async def search_skillsmp(
    query: str, category: str | None = None, page: int = 1, limit: int = 20
) -> list[SkillResult]:
    """Search SkillsMP API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            params = {"q": query, "page": page, "limit": limit}
            if category:
                params["category"] = category
            resp = await client.get(
                "https://skillsmp.com/api/v1/skills/search", params=params
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            return [
                SkillResult(
                    slug=s.get("slug", ""),
                    name=s.get("name", ""),
                    description=s.get("description", ""),
                    source="skillsmp",
                    source_url=s.get("source_url", ""),
                    author=s.get("author", ""),
                    stars=s.get("stars", 0),
                    tags=s.get("tags", []),
                    category=s.get("category", ""),
                )
                for s in data.get("skills", [])
            ]
    except Exception:
        return []


async def search_github(
    query: str, page: int = 1, limit: int = 10
) -> list[SkillResult]:
    """Search GitHub for SKILL.md files."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            params = {
                "q": f"{query} filename:SKILL.md",
                "per_page": limit,
                "page": page,
            }
            resp = await client.get(
                "https://api.github.com/search/code", params=params
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            results = []
            for item in data.get("items", [])[:limit]:
                repo = item.get("repository", {})
                results.append(
                    SkillResult(
                        slug=item.get("name", "unknown").replace(".md", ""),
                        name=item.get("name", "").replace(".md", ""),
                        description=repo.get("description", ""),
                        source="github",
                        source_url=item.get("html_url", ""),
                        author=repo.get("full_name", ""),
                        stars=repo.get("stargazers_count", 0),
                    )
                )
            return results
    except Exception:
        return []


async def search_all_sources(
    query: str,
    category: str | None = None,
    source: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> list[SkillResult]:
    """Search all sources and aggregate results."""
    tasks = []
    if source is None or source == "skillsmp":
        tasks.append(search_skillsmp(query, category, page, limit))
    if source is None or source == "github":
        tasks.append(search_github(query, page, limit))

    if not tasks:
        return []

    results_list = await asyncio.gather(*tasks)
    all_results = []
    for results in results_list:
        all_results.extend(results)

    # Deduplicate by slug
    seen = set()
    unique = []
    for r in all_results:
        if r.slug not in seen:
            seen.add(r.slug)
            unique.append(r)

    return unique[:limit]
