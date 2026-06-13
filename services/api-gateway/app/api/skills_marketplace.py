"""Marketplace API routes for skill discovery and installation."""
from __future__ import annotations

import shutil

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.skill_downloader import download_from_github, get_user_skills_dir, install_skill_to_user
from app.services.skill_scanner import scan_skill_files
from app.services.skill_sources import search_all_sources
from app.services.translator import translate_to_chinese

router = APIRouter(prefix="/api/skills/marketplace", tags=["skills-marketplace"])


class SearchResponse(BaseModel):
    skills: list[dict]
    total: int
    page: int


class InstallRequest(BaseModel):
    slug: str
    source: str
    source_url: str
    name: str = ""


class InstallResponse(BaseModel):
    ok: bool
    path: str
    slug: str


@router.get("/search", response_model=SearchResponse)
async def search_skills(
    q: str,
    category: str | None = None,
    source: str | None = None,
    page: int = 1,
    limit: int = 20,
):
    """Search skills from multiple sources."""
    results = await search_all_sources(q, category, source, page, limit)

    skills = []
    for r in results:
        skill_dict = {
            "slug": r.slug,
            "name": r.name,
            "description": r.description,
            "description_zh": "",
            "source": r.source,
            "source_url": r.source_url,
            "author": r.author,
            "stars": r.stars,
            "tags": r.tags,
            "category": r.category,
        }
        if r.description and not any("\u4e00" <= c <= "\u9fff" for c in r.description):
            skill_dict["description_zh"] = await translate_to_chinese(r.description)
        else:
            skill_dict["description_zh"] = r.description

        skills.append(skill_dict)

    return SearchResponse(skills=skills, total=len(skills), page=page)


@router.post("/install", response_model=InstallResponse)
async def install_skill(request: Request, body: InstallRequest):
    """Install a skill from external source to user's directory."""
    user_id = request.headers.get("X-User-Id", "default")

    if body.source == "github":
        files = await download_from_github(body.source_url)
    else:
        raise HTTPException(400, f"不支持的来源: {body.source}")

    if not files:
        raise HTTPException(404, "未找到技能文件")

    scan_result = scan_skill_files(files)
    if not scan_result.safe:
        raise HTTPException(400, f"安全检测未通过: {scan_result.reason}")

    path = install_skill_to_user(user_id, body.slug, files)

    return InstallResponse(ok=True, path=str(path), slug=body.slug)


@router.get("/installed")
async def list_installed_skills(request: Request):
    """List skills installed for the current user."""
    user_id = request.headers.get("X-User-Id", "default")
    skills_dir = get_user_skills_dir(user_id)

    if not skills_dir.exists():
        return {"skills": []}

    skills = []
    for skill_dir in skills_dir.iterdir():
        if skill_dir.is_dir():
            skill_md = skill_dir / "SKILL.md"
            content = skill_md.read_text(encoding="utf-8", errors="ignore") if skill_md.exists() else ""
            skills.append({
                "slug": skill_dir.name,
                "name": skill_dir.name,
                "preview": content[:500],
                "installed": True,
            })

    return {"skills": skills}


@router.delete("/installed/{slug}")
async def uninstall_skill(request: Request, slug: str):
    """Uninstall a skill from user's directory."""
    user_id = request.headers.get("X-User-Id", "default")
    skill_dir = get_user_skills_dir(user_id) / slug

    if not skill_dir.exists():
        raise HTTPException(404, f"技能 {slug} 未安装")

    shutil.rmtree(skill_dir)

    return {"ok": True, "slug": slug}
