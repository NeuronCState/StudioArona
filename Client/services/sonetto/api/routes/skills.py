"""Anthropic Skills & 内置工具列表 API。"""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()

PERSONAS_DIR = Path(__file__).resolve().parent.parent.parent / "config" / "personas"
ANTHROPIC_SKILLS_DIR = Path(__file__).resolve().parent.parent.parent / "anthropic_skills"


class SkillBody(BaseModel):
    slug: str
    content: str


def _skill_path(slug: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", slug):
        raise HTTPException(status_code=400, detail="Invalid skill slug")
    return ANTHROPIC_SKILLS_DIR / slug / "SKILL.md"


def _parse_frontmatter(text: str) -> dict[str, str]:
    """简易解析 YAML frontmatter，提取 name 和 description（支持多行 | 和 >）。"""
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return {}
    meta: dict[str, str] = {}
    lines = m.group(1).splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            if key in ("name", "description"):
                if val in ("|", ">"):
                    # 多行块标量：收集后续缩进行
                    parts: list[str] = []
                    i += 1
                    while i < len(lines) and (lines[i].startswith("  ") or lines[i].startswith("\t")):
                        parts.append(lines[i].strip())
                        i += 1
                    meta[key] = " ".join(parts)
                    continue
                else:
                    meta[key] = val.strip('"').strip("'")
        i += 1
    return meta


@router.get("/skills")
async def list_skills():
    """扫描 anthropic_skills/ 下所有 SKILL.md，返回结构化列表。"""
    if not ANTHROPIC_SKILLS_DIR.is_dir():
        return {"skills": []}

    skills: list[dict[str, str]] = []
    for sk_path in sorted(ANTHROPIC_SKILLS_DIR.rglob("SKILL.md")):
        rel = sk_path.relative_to(ANTHROPIC_SKILLS_DIR).parent
        meta = _parse_frontmatter(sk_path.read_text(encoding="utf-8"))
        name = meta.get("name", str(rel))
        description = meta.get("description", "")
        path_str = str(sk_path).replace("\\", "/")
        skills.append({
            "slug": str(rel).replace("\\", "/"),
            "name": name,
            "description": description,
            "path": path_str,
            "content": sk_path.read_text(encoding="utf-8"),
        })

    return {"skills": skills}


@router.post("/skills")
async def create_skill(body: SkillBody, request: Request):
    path = _skill_path(body.slug)
    if path.exists():
        raise HTTPException(status_code=409, detail="Skill already exists")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")
    from api.routes.configuration import refresh_prompt

    refresh_prompt(request)
    return {"slug": body.slug, "status": "created"}


@router.put("/skills/{slug}")
async def update_skill(slug: str, body: SkillBody, request: Request):
    path = _skill_path(slug)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")
    path.write_text(body.content, encoding="utf-8")
    from api.routes.configuration import refresh_prompt

    refresh_prompt(request)
    return {"slug": slug, "status": "updated"}


@router.delete("/skills/{slug}")
async def delete_skill(slug: str, request: Request):
    path = _skill_path(slug)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")
    path.unlink()
    try:
        path.parent.rmdir()
    except OSError:
        pass
    from api.routes.configuration import refresh_prompt

    refresh_prompt(request)
    return {"slug": slug, "status": "deleted"}


@router.get("/tools")
async def list_tools(request: Request):
    """返回所有已加载的 Python 内置工具（native_tools + mcp_tools）。"""
    tools = getattr(request.app.state, "tools", [])
    return {
        "tools": [
            {"name": t.name, "description": t.description}
            for t in tools
        ]
    }
