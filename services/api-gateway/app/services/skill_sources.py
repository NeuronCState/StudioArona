"""Multi-source skill search aggregation."""
from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import httpx

# ── SkillsMP 真实 category 缓存 (从 MCP list_categories 拉, 24h cache) ──
_CATEGORIES_CACHE_PATH = Path(
    os.environ.get(
        "SKILL_CATEGORIES_CACHE",
        str(Path.home() / ".studioarona" / "skill_categories.json"),
    )
)
_CATEGORIES_TTL_SECONDS = 86400  # 24h
_CATEGORIES_MCP_URL = "https://skillsmp.com/mcp"
_CATEGORIES_FALLBACK: dict[str, list[str]] = {
    # 万一 MCP 挂了, 用这份兜底关键词
    "development": [
        "python", "javascript", "typescript", "rust", "go", "java", "kotlin", "swift",
        "php", "ruby", "code", "coding", "programming", "develop", "lib", "sdk", "api",
        "frontend", "backend", "full-stack", "framework", "package", "scripting",
    ],
    "data-ai": [
        "data", "ai", "ml", "machine", "learn", "model", "neural", "gpt", "llm",
        "rag", "agent", "embedding", "vector", "analytics", "pandas", "numpy",
        "analysis", "engineering", "etl", "pipeline",
    ],
    "design": [
        "design", "ui", "ux", "figma", "css", "tailwind", "style", "theme",
        "color", "font", "icon", "svg",
    ],
    "devops": [
        "docker", "k8s", "kubernetes", "ci", "cd", "deploy", "aws", "gcp", "azure",
        "linux", "bash", "shell", "nginx", "terraform", "ansible", "helm",
        "monitor", "container", "cicd", "cloud",
    ],
    "testing-security": [
        "test", "qa", "jest", "pytest", "security", "audit", "vuln", "pentest",
        "auth", "oauth", "jwt", "ssl", "encrypt",
    ],
    "documentation": [
        "doc", "readme", "guide", "tutorial", "book", "wiki", "mdx", "markdown",
        "document",
    ],
    "content-media": [
        "blog", "article", "video", "audio", "image", "photo", "media", "youtube",
        "tiktok", "seo", "social", "content", "creation",
    ],
    "business": [
        "business", "sales", "marketing", "finance", "hr", "recruit", "legal",
        "contract", "ecommerce", "payment",
    ],
    "tools": [
        "tool", "util", "helper", "cli", "script", "automation", "bot", "workflow",
        "git", "workflow",
    ],
}


@dataclass
class CategoryEntry:
    """Real SkillsMP category node (domain + nested categories)."""
    domain: str
    domain_name: str
    slug: str
    name: str
    count: int
    # 子 categories 的 slugs/names (用来当 client-side 关键词)
    child_slugs: list[str] = field(default_factory=list)
    child_names: list[str] = field(default_factory=list)


async def _fetch_categories_from_mcp() -> list[CategoryEntry]:
    """Call SkillsMP MCP list_categories (Streamable HTTP, JSON-RPC 2.0)."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                _CATEGORIES_MCP_URL,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": "list_categories", "arguments": {}},
                },
            )
            if resp.status_code != 200:
                return []
            payload = resp.json()
            text = payload.get("result", {}).get("content", [{}])[0].get("text", "")
            data = json.loads(text)
            entries: list[CategoryEntry] = []
            for dom in data.get("domains", []):
                d_slug = dom.get("domain", "")
                d_name = dom.get("domainName", "")
                for cat in dom.get("categories", []):
                    entries.append(
                        CategoryEntry(
                            domain=d_slug,
                            domain_name=d_name,
                            slug=cat.get("slug", ""),
                            name=cat.get("name", ""),
                            count=cat.get("count", 0),
                            # 把子 categories 的 name/slug 当关键词 (e.g. "frontend", "cicd", "containers")
                            child_slugs=[c.get("slug", "") for c in dom.get("categories", [])],
                            child_names=[c.get("name", "") for c in dom.get("categories", [])],
                        )
                    )
            return entries
    except Exception:
        return []


async def list_real_categories() -> list[CategoryEntry]:
    """返真实 SkillsMP categories 列表 (24h disk cache, 失败用 fallback)."""
    # 1) 试读 disk cache
    try:
        if _CATEGORIES_CACHE_PATH.exists():
            stat = _CATEGORIES_CACHE_PATH.stat()
            if time.time() - stat.st_mtime < _CATEGORIES_TTL_SECONDS:
                raw = json.loads(_CATEGORIES_CACHE_PATH.read_text())
                return [CategoryEntry(**e) for e in raw]
    except Exception:
        pass

    # 2) 拉 MCP
    entries = await _fetch_categories_from_mcp()
    if entries:
        try:
            _CATEGORIES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            _CATEGORIES_CACHE_PATH.write_text(
                json.dumps([e.__dict__ for e in entries], ensure_ascii=False)
            )
        except Exception:
            pass
        return entries

    # 3) fallback (用 domain slug 当 CategoryEntry, child keywords 来自 _CATEGORIES_FALLBACK)
    fallback: list[CategoryEntry] = []
    for slug, kws in _CATEGORIES_FALLBACK.items():
        fallback.append(
            CategoryEntry(
                domain=slug,
                domain_name=slug,
                slug=slug,
                name=slug,
                count=0,
                child_slugs=kws,
                child_names=kws,
            )
        )
    return fallback


def match_category_keywords(
    entries: list[CategoryEntry], category_slug: str
) -> list[str]:
    """给定 category slug (e.g. 'devops'), 返所有子 categories 的 name+slug (小写) 当关键词.
    找不到返空 (调用方应 client-side 跳过过滤)."""
    for e in entries:
        if e.slug == category_slug or e.domain == category_slug:
            kws: list[str] = []
            for s in e.child_slugs:
                if s:
                    kws.append(s.lower())
            for n in e.child_names:
                if n:
                    kws.append(n.lower())
            # 去重
            return list(dict.fromkeys(kws))
    return []


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
    # 附加 url: skillsmp 详情页 (用户点箭头看原文用)
    detail_url: str = ""


async def search_skillsmp(
    query: str, category: str | None = None, page: int = 1, limit: int = 20
) -> list[SkillResult]:
    """Search SkillsMP API.

    匿名模式 (无 API key) 限制 50 req/day + 不支持 category/occupation 过滤
    (参数 silently 忽略). 带 API key (SKILLSMP_API_KEY env) 升到 500 req/day
    + 支持 category / occupation 真实过滤.

    Response shape:
    {
      "success": true,
      "data": {
        "skills": [
          {
            "id": "<slug>",
            "name": "...",
            "author": "...",
            "description": "...",
            "githubUrl": "https://github.com/...",
            "skillUrl": "https://skillsmp.com/skills/...",
            "stars": 1,
            "updatedAt": 1781081188
          }
        ],
        "pagination": { "page": ..., "limit": ..., "total": ... }
      }
    }
    """
    api_key = os.environ.get("SKILLSMP_API_KEY", "").strip()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            params: dict[str, str | int] = {"q": query, "page": page, "limit": limit}
            # 只有带 key 时才传 category/occupation (匿名模式 silently 忽略)
            if api_key and category:
                params["category"] = category
            headers: dict[str, str] = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            resp = await client.get(
                "https://skillsmp.com/api/v1/skills/search",
                params=params,
                headers=headers,
            )
            if resp.status_code != 200:
                return []
            payload = resp.json()
            skills = payload.get("data", {}).get("skills", [])
            results: list[SkillResult] = []
            for s in skills:
                results.append(
                    SkillResult(
                        # 'id' 字段是该 API 的稳定 slug
                        slug=s.get("id", ""),
                        name=s.get("name", ""),
                        description=s.get("description", ""),
                        source="skillsmp",
                        # 优先用 githubUrl (用于 install), 没有就退到 skillUrl
                        source_url=s.get("githubUrl", "") or s.get("skillUrl", ""),
                        # skillsmp 详情页 (前端"看原文"跳转用)
                        detail_url=s.get("skillUrl", ""),
                        author=s.get("author", ""),
                        stars=s.get("stars", 0),
                        tags=s.get("tags", []) or [],
                        category=s.get("category", ""),
                    )
                )
            return results
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
