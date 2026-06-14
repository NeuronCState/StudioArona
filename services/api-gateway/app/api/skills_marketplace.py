"""Marketplace API routes for skill discovery and installation."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.skill_downloader import (
    download_from_github,
    download_skill_folder,
    get_user_skills_dir,
    install_skill_to_user,
    mark_marketplace_skill,
)
from app.services.skill_scanner import scan_skill_files
from app.services.skill_sources import (
    list_real_categories,
    search_all_sources,
)
from app.services.translator import translate_to_chinese

router = APIRouter(prefix="/api/skills/marketplace", tags=["skills-marketplace"])


class SearchResponse(BaseModel):
    skills: list[dict]
    total: int
    page: int


class InstallRequest(BaseModel):
    slug: str
    source: str
    # source_url 可选 — skillsmp 来源下 backend 会从 MCP 拿 githubUrl, 这里也可手动提供
    source_url: str = ""
    name: str = ""
    detail_url: str = ""


class InstallResponse(BaseModel):
    ok: bool
    path: str
    slug: str


class TrendingResponse(BaseModel):
    skills: list[dict]
    total: int
    source: str
    cached: bool


class TrendingWindow:
    """热门窗口: stars 是累积量, stars 排名 = 全网热门. updatedAt 控时间窗."""
    ALL = "all"        # sortBy=stars, top 50
    WEEK = "week"      # sortBy=stars + updatedAt within 7d
    MONTH = "month"    # sortBy=stars + updatedAt within 30d


@router.get("/search", response_model=SearchResponse)
async def search_skills(
    q: str,
    category: str | None = None,
    source: str | None = None,
    page: int = 1,
    limit: int = 20,
):
    """Search skills from multiple sources.

    注意: skillsmp.com 匿名 API 不支持 category/occupation 过滤 (参数 silently 忽略),
    带 SKILLSMP_API_KEY 仍 silently 忽略 (实测). 真实分类过滤由前端 client-side 兜底.
    """
    results = await search_all_sources(q, category, source, page, limit)

    # 并行翻译所有 description (MyMemory 1s/skill, 18 个顺序要 18s+)
    async def _translate_one(r):
        skill_dict = {
            "slug": r.slug,
            "name": r.name,
            "description": r.description,
            "description_zh": "",
            "source": r.source,
            "source_url": r.source_url,
            "detail_url": r.detail_url,
            "author": r.author,
            "stars": r.stars,
            "tags": r.tags,
            "category": r.category,
        }
        if r.description and not any("\u4e00" <= c <= "\u9fff" for c in r.description):
            skill_dict["description_zh"] = await translate_to_chinese(r.description)
        else:
            skill_dict["description_zh"] = r.description
        return skill_dict

    skills = await asyncio.gather(*[_translate_one(r) for r in results])
    return SearchResponse(skills=list(skills), total=len(skills), page=page)


@router.get("/categories")
async def get_categories():
    """返真实 SkillsMP categories 列表 (24h 缓存).

    Response shape:
    [
      { domain, domain_name, slug, name, count, child_slugs, child_names }
    ]
    """
    entries = await list_real_categories()
    return {
        "categories": [
            {
                "domain": e.domain,
                "domain_name": e.domain_name,
                "slug": e.slug,
                "name": e.name,
                "count": e.count,
                "child_slugs": e.child_slugs,
                "child_names": e.child_names,
            }
            for e in entries
        ],
        "total": len(entries),
    }


@router.post("/install", response_model=InstallResponse)
async def install_skill(
    request: Request,
    body: InstallRequest,
    user: User = Depends(get_current_user),
):
    """Install a skill from external source to user's directory.

    支持来源:
      - "github": 直接用 source_url 走 GitHub 原始下载流程
      - "skillsmp": 调 MCP get_skill 拿 githubUrl, 再走 GitHub 流程
    """
    user_id = user.id
    if body.source == "github":
        # GitHub folder URL (含 /tree/) → 走 folder download
        if "/tree/" in body.source_url or "/blob/" in body.source_url:
            files = await download_skill_folder(body.source_url)
        else:
            files = await download_from_github(body.source_url)
    elif body.source == "skillsmp":
        # skillsmp 没有真直链, 需要从 skill_id (slug) 调 MCP get_skill 拿 githubUrl
        github_url = await _skillsmp_get_github_url(body.slug)
        if not github_url:
            raise HTTPException(
                404,
                f"无法从 skillsmp 获取 skill 源地址 (id={body.slug}). 可能 API 限制或 skill 不存在.",
            )
        # githubUrl 通常是 /tree/ folder 形式 → 走 folder download
        if "/tree/" in github_url or "/blob/" in github_url:
            files = await download_skill_folder(github_url)
        else:
            files = await download_from_github(github_url)
    else:
        raise HTTPException(400, f"不支持的来源: {body.source}")

    if not files:
        raise HTTPException(404, "未找到技能文件")

    scan_result = scan_skill_files(files)
    if not scan_result.safe:
        raise HTTPException(400, f"安全检测未通过: {scan_result.reason}")

    path = install_skill_to_user(user_id, body.slug, files)

    # 标记是 marketplace source, 之后 /installed 端点靠这判断
    mark_marketplace_skill(user_id, body.slug, body.source, body.source_url or "")

    return InstallResponse(ok=True, path=str(path), slug=body.slug)


_SKILLSMP_GITHUB_CACHE: dict[str, tuple[float, str]] = {}  # slug -> (ts, url), 24h


async def _skillsmp_get_github_url(skill_id: str) -> str:
    """调 SkillsMP MCP get_skill 拿 githubUrl (24h 内存缓存)."""
    cached = _SKILLSMP_GITHUB_CACHE.get(skill_id)
    if cached and (time.time() - cached[0]) < 86400:
        return cached[1]
    api_key = os.environ.get("SKILLSMP_API_KEY", "").strip()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                "https://skillsmp.com/mcp",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    **({"Authorization": f"Bearer {api_key}"} if api_key else {}),
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": "get_skill", "arguments": {"id": skill_id}},
                },
            )
            if resp.status_code != 200:
                return ""
            payload = resp.json()
            content = payload.get("result", {}).get("content", [{}])[0].get("text", "")
            if not content:
                return ""
            data = json.loads(content)
            # MCP get_skill 返 {"skill": {githubUrl: ...}} 嵌套结构
            skill = data.get("skill", data)
            url = skill.get("githubUrl", "") or skill.get("github_url", "")
            if url:
                _SKILLSMP_GITHUB_CACHE[skill_id] = (time.time(), url)
            return url
    except Exception:
        return ""


@router.get("/installed")
async def list_installed_skills(
    user: User = Depends(get_current_user),
):
    """List marketplace-installed skills for the current user.

    Returns a flat list of slugs (folder names) that can be matched against
    marketplace skill.slug to mark them as installed in the UI.

    只返有 `.marketplace_source` 标记的 skill (从 marketplace install 来的),
    排除用户手写 / hermes 自动生成的.
    """
    user_id = user.id
    skills_dir = get_user_skills_dir(user_id)

    if not skills_dir.exists():
        return {"skills": [], "slugs": [], "total": 0}

    skills = []
    slugs: list[str] = []
    for skill_dir in skills_dir.iterdir():
        if not skill_dir.is_dir():
            continue
        if skill_dir.name.startswith("."):
            continue
        # 只收有 .marketplace_source 标记的
        marker = skill_dir / ".marketplace_source"
        if not marker.exists():
            continue
        try:
            marker_content = marker.read_text(encoding="utf-8").strip()
            parts = marker_content.split("\t", 1)
            source = parts[0] if parts else ""
            source_url = parts[1] if len(parts) > 1 else ""
        except Exception:
            source = ""
            source_url = ""

        skill_md = skill_dir / "SKILL.md"
        content = (
            skill_md.read_text(encoding="utf-8", errors="ignore")
            if skill_md.exists()
            else ""
        )
        # parse skill name from frontmatter
        name = skill_dir.name
        m = content.split("\n", 1)[0] if content else ""
        if m.startswith("---"):
            for line in content.split("\n"):
                if line.startswith("name:"):
                    name = line.split(":", 1)[1].strip()
                    break

        slugs.append(skill_dir.name)
        skills.append({
            "slug": skill_dir.name,
            "name": name,
            "preview": content[:500],
            "source": source,
            "source_url": source_url,
            "installed": True,
        })

    return {
        "skills": skills,
        "slugs": slugs,  # 跟 marketplace skill.slug 对账用
        "total": len(slugs),
    }


@router.delete("/installed/{slug}")
async def uninstall_skill(request: Request, slug: str):
    """Uninstall a skill from user's directory."""
    user_id = request.headers.get("X-User-Id", "default")
    skill_dir = get_user_skills_dir(user_id) / slug

    if not skill_dir.exists():
        raise HTTPException(404, f"技能 {slug} 未安装")

    shutil.rmtree(skill_dir)

    return {"ok": True, "slug": slug}


# ════════════════════════════════════════════════════════════════
# Trending Skills (全网热门 — 跨用户共享, 6h 缓存)
# ════════════════════════════════════════════════════════════════


_TRENDING_CACHE: dict[str, tuple[float, list[dict]]] = {}
_TRENDING_TTL_SECONDS = 6 * 3600  # 6h


async def _fetch_trending_skills(
    window: str = "all",  # all | week | month
    limit: int = 30,
) -> list[dict]:
    """从 skillsmp 拉热门 skills (sortBy=stars), client-side 按 updatedAt 过滤时间窗."""
    cache_key = f"{window}:{limit}"
    cached = _TRENDING_CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _TRENDING_TTL_SECONDS:
        return cached[1]

    # 拉多页 (热门 1 页最多 50, 60 个用 limit=50 + page=2)
    all_results: list[dict] = []
    api_key = os.environ.get("SKILLSMP_API_KEY", "").strip()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        **({"Authorization": f"Bearer {api_key}"} if api_key else {}),
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for page in (1, 2):
                resp = await client.get(
                    "https://skillsmp.com/api/v1/skills/search",
                    params={"q": "skill", "sortBy": "stars", "limit": 50, "page": page},
                    headers=headers,
                )
                if resp.status_code != 200:
                    break
                payload = resp.json()
                skills = payload.get("data", {}).get("skills", [])
                all_results.extend(skills)
                if len(skills) < 50:
                    break  # 末页
            if not all_results:
                return []

        # 转换 + 时间窗过滤
        import datetime as _dt
        now_ts = int(time.time())
        if window == "week":
            min_ts = now_ts - 7 * 86400
        elif window == "month":
            min_ts = now_ts - 30 * 86400
        else:
            min_ts = 0

        results: list[dict] = []
        for s in all_results:
            if int(s.get("updatedAt", 0)) < min_ts:
                continue
            desc = s.get("description", "")
            results.append(
                {
                    "slug": s.get("id", ""),
                    "name": s.get("name", ""),
                    "description": desc,
                    "description_zh": "",  # 翻译留到客户端 cache 后, 或用 _translate_skills 后置
                    "source": "skillsmp",
                    "source_url": s.get("githubUrl", "") or s.get("skillUrl", ""),
                    "detail_url": s.get("skillUrl", ""),
                    "author": s.get("author", ""),
                    "stars": s.get("stars", 0),
                    "tags": [],
                    "category": "",
                    "updated_at": s.get("updatedAt", 0),
                }
            )
            if len(results) >= limit:
                break
        # 翻译 descriptions (并行)
        async def _translate(s: dict) -> dict:
            d = s["description"]
            if d and not any("\u4e00" <= c <= "\u9fff" for c in d):
                s["description_zh"] = await translate_to_chinese(d)
            else:
                s["description_zh"] = d
            return s

        results = await asyncio.gather(*[_translate(s) for s in results])

        _TRENDING_CACHE[cache_key] = (time.time(), results)
        return results
    except Exception as e:
        # 出错返 cache (如有过)
        if cached:
            return cached[1]
        return []


@router.get("/trending", response_model=TrendingResponse)
async def get_trending(window: str = "all", limit: int = 30):
    """返全网热门 skills (跨用户共享, 6h 缓存).

    window: all | week | month
    """
    if window not in ("all", "week", "month"):
        window = "all"
    skills = await _fetch_trending_skills(window, min(limit, 50))
    return TrendingResponse(
        skills=skills,
        total=len(skills),
        source="skillsmp+stars",
        cached=True,
    )
