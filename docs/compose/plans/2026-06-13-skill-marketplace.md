# Skill Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a skill marketplace feature that allows users to browse, search, and download skills from SkillsMP/SkillHub/GitHub, with automatic English-to-Chinese translation.

**Architecture:** Multi-source aggregation backend (FastAPI) + React frontend with category browsing, search, and one-click install. Skills are downloaded to per-user directories for isolation.

**Tech Stack:** FastAPI, React, TanStack Query, Tailwind CSS, httpx (for API calls), LLM Gateway (for translation)

---

## File Structure

### Backend (New Files)

| File | Responsibility |
|------|----------------|
| `services/api-gateway/app/api/skills_marketplace.py` | API routes for marketplace |
| `services/api-gateway/app/services/skill_sources.py` | Multi-source search aggregation |
| `services/api-gateway/app/services/skill_downloader.py` | Download skills from sources |
| `services/api-gateway/app/services/skill_scanner.py` | Security scanning |
| `services/api-gateway/app/services/translator.py` | English-to-Chinese translation |
| `tests/D/unit/test_skills_marketplace.py` | Unit tests |

### Frontend (New Files)

| File | Responsibility |
|------|----------------|
| `apps/web/src/pages/skills/MarketplaceTab.tsx` | Main marketplace tab |
| `apps/web/src/pages/skills/SkillMarketCard.tsx` | Skill card for marketplace |
| `apps/web/src/pages/skills/CategoryTabs.tsx` | Category filter tabs |
| `apps/web/src/pages/skills/UploadDialog.tsx` | Upload skill dialog |

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/src/pages/skills/SkillsPage.tsx` | Add Marketplace tab |
| `services/api-gateway/app/main.py` | Register marketplace router |

---

## Task 1: Backend - Skill Sources Service

**Covers:** Multi-source search aggregation

**Files:**
- Create: `services/api-gateway/app/services/skill_sources.py`
- Test: `tests/D/unit/test_skill_sources.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/D/unit/test_skill_sources.py
import pytest
from app.services.skill_sources import search_all_sources, SkillResult

@pytest.mark.asyncio
async def test_search_all_sources_returns_list():
    """Search should return a list of SkillResult from multiple sources."""
    results = await search_all_sources("python", page=1, limit=10)
    assert isinstance(results, list)

@pytest.mark.asyncio
async def test_skill_result_has_required_fields():
    """Each result should have slug, name, description, source, source_url."""
    results = await search_all_sources("python", page=1, limit=1)
    if results:
        r = results[0]
        assert hasattr(r, 'slug')
        assert hasattr(r, 'name')
        assert hasattr(r, 'description')
        assert hasattr(r, 'source')
        assert hasattr(r, 'source_url')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/D/unit/test_skill_sources.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'app.services.skill_sources'"

- [ ] **Step 3: Write minimal implementation**

```python
# services/api-gateway/app/services/skill_sources.py
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
    description_zh: str = ""
    source: str  # skillsmp, skillhub, github
    source_url: str
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/D/unit/test_skill_sources.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api-gateway/app/services/skill_sources.py tests/D/unit/test_skill_sources.py
git commit -m "feat(gateway): add multi-source skill search aggregation"
```

---

## Task 2: Backend - Translation Service

**Covers:** Auto English-to-Chinese translation

**Files:**
- Create: `services/api-gateway/app/services/translator.py`
- Test: `tests/D/unit/test_translator.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/D/unit/test_translator.py
import pytest
from app.services.translator import translate_to_chinese, is_chinese

def test_is_chinese_detects_chinese():
    assert is_chinese("这是一个中文字符串") is True

def test_is_chinese_detects_english():
    assert is_chinese("This is English") is False

def test_is_chinese_mixed():
    assert is_chinese("Hello 你好") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/D/unit/test_translator.py -v`
Expected: FAIL with "ModuleNotFoundError"

- [ ] **Step 3: Write minimal implementation**

```python
# services/api-gateway/app/services/translator.py
"""English-to-Chinese translation using LLM Gateway."""
from __future__ import annotations

import re


def is_chinese(text: str) -> bool:
    """Check if text is predominantly Chinese."""
    if not text:
        return False
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
    return chinese_chars > len(text) * 0.3


async def translate_to_chinese(text: str) -> str:
    """Translate English text to Chinese using LLM Gateway."""
    if not text or is_chinese(text):
        return text

    try:
        import httpx
        import os

        gateway_url = os.getenv(
            "LLM_GATEWAY_SERVICE_URL", "http://127.0.0.1:8645"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{gateway_url}/v1/chat/completions",
                json={
                    "model": os.getenv("MINIMAX_MODEL", "MiniMax-M2.5-highspeed"),
                    "messages": [
                        {
                            "role": "system",
                            "content": "将以下英文文本翻译为中文，保持专业术语，简洁准确。只输出翻译结果，不要添加解释。",
                        },
                        {"role": "user", "content": text},
                    ],
                    "max_tokens": 500,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
    except Exception:
        pass

    return text


async def translate_skill_descriptions(
    skills: list[dict],
) -> list[dict]:
    """Translate description fields in a list of skills."""
    for skill in skills:
        if skill.get("description") and not is_chinese(skill["description"]):
            skill["description_zh"] = await translate_to_chinese(skill["description"])
        else:
            skill["description_zh"] = skill.get("description", "")
    return skills
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/D/unit/test_translator.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api-gateway/app/services/translator.py tests/D/unit/test_translator.py
git commit -m "feat(gateway): add English-to-Chinese translation service"
```

---

## Task 3: Backend - Security Scanner

**Covers:** Auto security detection for uploaded/downloaded skills

**Files:**
- Create: `services/api-gateway/app/services/skill_scanner.py`
- Test: `tests/D/unit/test_skill_scanner.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/D/unit/test_skill_scanner.py
import pytest
from app.services.skill_scanner import scan_skill_content, ScanResult

def test_safe_content():
    content = "# My Skill\n\nThis is a safe skill description."
    result = scan_skill_content(content)
    assert result.safe is True

def test_dangerous_eval():
    content = "import os\nos.system('rm -rf /')"
    result = scan_skill_content(content)
    assert result.safe is False
    assert "dangerous" in result.reason.lower() or "危险" in result.reason

def test_dangerous_subprocess():
    content = "subprocess.call(['ls'])"
    result = scan_skill_content(content)
    assert result.safe is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/D/unit/test_skill_scanner.py -v`
Expected: FAIL with "ModuleNotFoundError"

- [ ] **Step 3: Write minimal implementation**

```python
# services/api-gateway/app/services/skill_scanner.py
"""Security scanner for skill files."""
from __future__ import annotations

import re
from dataclasses import dataclass


DANGEROUS_PATTERNS = [
    (r"import\s+os\s*\.\s*system", "os.system call"),
    (r"subprocess\.(call|run|Popen)\s*\(", "subprocess execution"),
    (r"eval\s*\(", "eval() call"),
    (r"exec\s*\(", "exec() call"),
    (r"__import__\s*\(", "dynamic import"),
    (r"rm\s+-rf", "recursive delete"),
    (r"curl\s+.*\|\s*(bash|sh)", "remote code execution"),
    (r"wget\s+.*\|\s*(bash|sh)", "remote code execution"),
    (r"chmod\s+777", "unsafe permissions"),
    (r"rm\s+.*\*", "wildcard delete"),
]


@dataclass
class ScanResult:
    safe: bool
    reason: str = ""
    warnings: list[str] | None = None


def scan_skill_content(content: str) -> ScanResult:
    """Scan skill content for dangerous patterns."""
    warnings = []

    for pattern, desc in DANGEROUS_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            return ScanResult(safe=False, reason=f"检测到危险模式: {desc}")

    # Check for suspicious imports
    suspicious_imports = ["subprocess", "os", "shutil", "socket"]
    for imp in suspicious_imports:
        if re.search(rf"^import\s+{imp}\b", content, re.MULTILINE):
            warnings.append(f"导入了系统模块: {imp}")

    return ScanResult(safe=True, warnings=warnings)


def scan_skill_files(files: dict[str, str]) -> ScanResult:
    """Scan multiple skill files for security issues."""
    for filename, content in files.items():
        result = scan_skill_content(content)
        if not result.safe:
            return ScanResult(
                safe=False,
                reason=f"文件 {filename}: {result.reason}",
            )

    return ScanResult(safe=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/D/unit/test_skill_scanner.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api-gateway/app/services/skill_scanner.py tests/D/unit/test_skill_scanner.py
git commit -m "feat(gateway): add skill security scanner"
```

---

## Task 4: Backend - Skill Downloader

**Covers:** Download skills from sources to user directory

**Files:**
- Create: `services/api-gateway/app/services/skill_downloader.py`
- Test: `tests/D/unit/test_skill_downloader.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/D/unit/test_skill_downloader.py
import pytest
from pathlib import Path
from app.services.skill_downloader import download_from_github, get_hermes_home

def test_get_hermes_home():
    home = get_hermes_home()
    assert home.exists() or home.parent.exists()

@pytest.mark.asyncio
async def test_download_from_github_returns_files():
    """Download should return a dict of filename -> content."""
    # Using a known public SKILL.md
    url = "https://raw.githubusercontent.com/anthropics/skills/main/skills/brainstorming/SKILL.md"
    files = await download_from_github(url)
    assert isinstance(files, dict)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/D/unit/test_skill_downloader.py -v`
Expected: FAIL with "ModuleNotFoundError"

- [ ] **Step 3: Write minimal implementation**

```python
# services/api-gateway/app/services/skill_downloader.py
"""Download skills from external sources."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import httpx


def get_hermes_home() -> Path:
    """Get the Hermes profiles directory."""
    return Path.home() / ".hermes" / "profiles"


def get_user_skills_dir(user_id: str) -> Path:
    """Get the skills directory for a specific user."""
    return get_hermes_home() / user_id / "skills"


async def download_from_github(raw_url: str) -> dict[str, str]:
    """Download skill files from GitHub raw URL."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(raw_url)
            if resp.status_code == 200:
                # Extract filename from URL
                filename = raw_url.split("/")[-1] or "SKILL.md"
                return {filename: resp.text}
    except Exception:
        pass
    return {}


async def download_skill_folder(
    repo_url: str, folder_path: str = ""
) -> dict[str, str]:
    """Download all files from a GitHub folder."""
    # Convert GitHub URL to API URL
    # https://github.com/owner/repo/tree/main/path
    # -> https://api.github.com/repos/owner/repo/contents/path
    parts = repo_url.replace("https://github.com/", "").split("/")
    if len(parts) < 2:
        return {}

    owner, repo = parts[0], parts[1]
    path = folder_path or "/".join(parts[3:]) if len(parts) > 3 else ""

    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(api_url)
            if resp.status_code != 200:
                return {}

            items = resp.json()
            if not isinstance(items, list):
                return {}

            files = {}
            for item in items:
                if item.get("type") == "file":
                    download_url = item.get("download_url")
                    if download_url:
                        file_resp = await client.get(download_url)
                        if file_resp.status_code == 200:
                            filename = item.get("name", "unknown")
                            files[filename] = file_resp.text

            return files
    except Exception:
        return {}


def install_skill_to_user(
    user_id: str, slug: str, files: dict[str, str]
) -> Path:
    """Install downloaded skill files to user's directory."""
    target_dir = get_user_skills_dir(user_id) / slug
    target_dir.mkdir(parents=True, exist_ok=True)

    for filename, content in files.items():
        (target_dir / filename).write_text(content, encoding="utf-8")

    return target_dir


def remove_skill_from_user(user_id: str, slug: str) -> bool:
    """Remove a skill from user's directory."""
    skill_dir = get_user_skills_dir(user_id) / slug
    if skill_dir.exists():
        shutil.rmtree(skill_dir)
        return True
    return False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/D/unit/test_skill_downloader.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/api-gateway/app/services/skill_downloader.py tests/D/unit/test_skill_downloader.py
git commit -m "feat(gateway): add skill downloader service"
```

---

## Task 5: Backend - Marketplace API Routes

**Covers:** API endpoints for marketplace operations

**Files:**
- Create: `services/api-gateway/app/api/skills_marketplace.py`
- Modify: `services/api-gateway/app/main.py` (register router)
- Test: `tests/D/unit/test_skills_marketplace.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/D/unit/test_skills_marketplace.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import create_app

@pytest.fixture
def app():
    return create_app()

@pytest.fixture
def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")

@pytest.mark.asyncio
async def test_search_endpoint(client):
    resp = await client.get("/api/skills/marketplace/search", params={"q": "python"})
    assert resp.status_code in (200, 422)  # 422 if validation error

@pytest.mark.asyncio
async def test_install_endpoint_requires_body(client):
    resp = await client.post("/api/skills/marketplace/install")
    assert resp.status_code == 422  # Validation error
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/D/unit/test_skills_marketplace.py -v`
Expected: FAIL with "ModuleNotFoundError"

- [ ] **Step 3: Write minimal implementation**

```python
# services/api-gateway/app/api/skills_marketplace.py
"""Marketplace API routes for skill discovery and installation."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from typing import Optional

from app.services.skill_sources import search_all_sources, SkillResult
from app.services.skill_downloader import (
    download_from_github,
    install_skill_to_user,
    get_user_skills_dir,
)
from app.services.skill_scanner import scan_skill_files, ScanResult
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
    category: Optional[str] = None,
    source: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
):
    """Search skills from multiple sources."""
    results = await search_all_sources(q, category, source, page, limit)

    # Translate descriptions
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
        # Translate if needed
        if r.description and not any(
            "\u4e00" <= c <= "\u9fff" for c in r.description
        ):
            skill_dict["description_zh"] = await translate_to_chinese(r.description)
        else:
            skill_dict["description_zh"] = r.description

        skills.append(skill_dict)

    return SearchResponse(skills=skills, total=len(skills), page=page)


@router.post("/install", response_model=InstallResponse)
async def install_skill(request: Request, body: InstallRequest):
    """Install a skill from external source to user's directory."""
    user_id = request.headers.get("X-User-Id", "default")

    # Download from source
    if body.source == "github":
        files = await download_from_github(body.source_url)
    else:
        raise HTTPException(400, f"不支持的来源: {body.source}")

    if not files:
        raise HTTPException(404, "未找到技能文件")

    # Security scan
    scan_result = scan_skill_files(files)
    if not scan_result.safe:
        raise HTTPException(400, f"安全检测未通过: {scan_result.reason}")

    # Install to user directory
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

    import shutil
    shutil.rmtree(skill_dir)

    return {"ok": True, "slug": slug}
```

- [ ] **Step 4: Register router in main.py**

```python
# In services/api-gateway/app/main.py, add:
from app.api.skills_marketplace import router as marketplace_router
app.include_router(marketplace_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/D/unit/test_skills_marketplace.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/api-gateway/app/api/skills_marketplace.py services/api-gateway/app/main.py tests/D/unit/test_skills_marketplace.py
git commit -m "feat(gateway): add marketplace API routes"
```

---

## Task 6: Frontend - Category Tabs Component

**Covers:** Category browsing UI

**Files:**
- Create: `apps/web/src/pages/skills/CategoryTabs.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/pages/skills/CategoryTabs.tsx
import { Code, Database, Palette, Server, Shield, FileText, Image, Briefcase, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const categories = [
  { id: null, label: '全部', icon: null },
  { id: 'development', label: '开发', icon: Code },
  { id: 'data-ai', label: '数据与AI', icon: Database },
  { id: 'design', label: '设计', icon: Palette },
  { id: 'devops', label: '运维', icon: Server },
  { id: 'testing-security', label: '测试安全', icon: Shield },
  { id: 'documentation', label: '文档', icon: FileText },
  { id: 'content-media', label: '内容媒体', icon: Image },
  { id: 'business', label: '商业', icon: Briefcase },
  { id: 'tools', label: '工具', icon: Wrench },
];

interface CategoryTabsProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
}

export function CategoryTabs({ selected, onSelect }: CategoryTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const Icon = cat.icon;
        const isActive = selected === cat.id;
        return (
          <button
            key={cat.id ?? 'all'}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            )}
          >
            {Icon && <Icon size={12} />}
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/skills/CategoryTabs.tsx
git commit -m "feat(web): add category tabs component"
```

---

## Task 7: Frontend - Skill Market Card Component

**Covers:** Skill card UI for marketplace

**Files:**
- Create: `apps/web/src/pages/skills/SkillMarketCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/pages/skills/SkillMarketCard.tsx
import { useState } from 'react';
import { Download, Check, ExternalLink, Star, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@javis/ui-kit';
import { motion as m } from '@/lib/motion';

interface MarketSkill {
  slug: string;
  name: string;
  description: string;
  description_zh: string;
  source: string;
  source_url: string;
  author: string;
  stars: number;
  tags: string[];
  category: string;
  installed?: boolean;
}

const sourceColors: Record<string, string> = {
  skillsmp: 'bg-blue-500/10 text-blue-500',
  skillhub: 'bg-green-500/10 text-green-500',
  github: 'bg-gray-500/10 text-gray-500',
};

interface SkillMarketCardProps {
  skill: MarketSkill;
  onInstall: (skill: MarketSkill) => void;
  isInstalling?: boolean;
}

export function SkillMarketCard({ skill, onInstall, isInstalling }: SkillMarketCardProps) {
  const displayName = skill.description_zh || skill.description;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.005 }}
      transition={{ duration: m.duration.base / 1000, ease: m.easing.out }}
      className="group rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface-glass)] p-5 shadow-[var(--shadow-1)] backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
            {skill.name}
          </h3>
          {skill.author && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)] truncate">
              by {skill.author}
            </p>
          )}
        </div>
        <Badge className={cn('shrink-0', sourceColors[skill.source])}>
          {skill.source}
        </Badge>
      </div>

      {/* Description */}
      <p
        className={cn(
          'mt-3 text-xs leading-relaxed text-[var(--color-text-secondary)]',
          expanded ? '' : 'line-clamp-3'
        )}
      >
        {displayName}
      </p>
      {displayName.length > 150 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-[var(--color-accent)] hover:underline"
        >
          {expanded ? '收起' : '展开'}
        </button>
      )}

      {/* Tags */}
      {skill.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skill.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          {skill.stars > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star size={10} className="fill-current" />
              {skill.stars}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={skill.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text-primary)]"
            title="查看源码"
          >
            <ExternalLink size={12} />
          </a>

          <button
            onClick={() => onInstall(skill)}
            disabled={isInstalling || skill.installed}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              skill.installed
                ? 'bg-green-500/10 text-green-500 cursor-default'
                : 'bg-[var(--color-accent)] text-white hover:opacity-90'
            )}
          >
            {isInstalling ? (
              <Loader2 size={12} className="animate-spin" />
            ) : skill.installed ? (
              <Check size={12} />
            ) : (
              <Download size={12} />
            )}
            {skill.installed ? '已安装' : '安装'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/skills/SkillMarketCard.tsx
git commit -m "feat(web): add skill market card component"
```

---

## Task 8: Frontend - Marketplace Tab

**Covers:** Main marketplace tab with search, categories, and grid

**Files:**
- Create: `apps/web/src/pages/skills/MarketplaceTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/pages/skills/MarketplaceTab.tsx
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Skeleton, EmptyState } from '@javis/ui-kit';
import { useAuthStore } from '@/stores/auth';
import { CategoryTabs } from './CategoryTabs';
import { SkillMarketCard } from './SkillMarketCard';
import { StaggerList, StaggerItem } from '@/components/motion';

interface MarketSkill {
  slug: string;
  name: string;
  description: string;
  description_zh: string;
  source: string;
  source_url: string;
  author: string;
  stars: number;
  tags: string[];
  category: string;
}

interface SearchResponse {
  skills: MarketSkill[];
  total: number;
  page: number;
}

export function MarketplaceTab() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? 'demo';
  const queryClient = useQueryClient();

  const {
    data,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['marketplace', search, category, page],
    queryFn: () =>
      api.get<SearchResponse>('/api/skills/marketplace/search', {
        params: { q: search || 'skill', category, page, limit: 20 },
      }),
    enabled: true,
  });

  const installMutation = useMutation({
    mutationFn: (skill: MarketSkill) =>
      api.post('/api/skills/marketplace/install', {
        slug: skill.slug,
        source: skill.source,
        source_url: skill.source_url,
        name: skill.name,
      }, {
        headers: { 'X-User-Id': userId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['user-skills', userId] });
    },
  });

  const handleInstall = useCallback(
    (skill: MarketSkill) => {
      installMutation.mutate(skill);
    },
    [installMutation]
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="搜索技能... (如: python, design, data)"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
        >
          <RefreshCw size={12} />
          刷新
        </button>
      </div>

      {/* Categories */}
      <CategoryTabs selected={category} onSelect={(c) => { setCategory(c); setPage(1); }} />

      {/* Results */}
      {isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rect" height={180} />
          ))}
        </div>
      ) : !data?.skills?.length ? (
        <EmptyState
          icon={<Sparkles size={40} />}
          title="未找到技能"
          description="尝试其他关键词或分类"
        />
      ) : (
        <>
          <p className="text-xs text-[var(--color-text-muted)]">
            找到 {data.total} 个技能
          </p>
          <StaggerList className="grid grid-cols-1 gap-4 md:grid-cols-2" staggerKey="marketplace">
            {data.skills.map((skill) => (
              <StaggerItem key={`${skill.source}-${skill.slug}`}>
                <SkillMarketCard
                  skill={skill}
                  onInstall={handleInstall}
                  isInstalling={installMutation.isPending}
                />
              </StaggerItem>
            ))}
          </StaggerList>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/skills/MarketplaceTab.tsx
git commit -m "feat(web): add marketplace tab component"
```

---

## Task 9: Frontend - Integrate into SkillsPage

**Covers:** Add marketplace tab to existing skills page

**Files:**
- Modify: `apps/web/src/pages/skills/SkillsPage.tsx`

- [ ] **Step 1: Add marketplace tab**

```tsx
// In apps/web/src/pages/skills/SkillsPage.tsx, add:
import { MarketplaceTab } from './MarketplaceTab';

// Update the tabs array:
const [activeTab, setActiveTab] = useState<'all' | 'user' | 'hermes' | 'marketplace'>('all');

// Add to Tabs component:
<Tabs
  tabs={[
    { id: 'all', label: `全部 ${data?.total ?? 0}` },
    { id: 'user', label: `用户 ${userCount}` },
    { id: 'hermes', label: `Hermes ${hermesCount}` },
    { id: 'marketplace', label: '市场' },
  ]}
  activeTab={activeTab}
  onTabChange={(t) => setActiveTab(t as typeof activeTab)}
/>

// Add conditional rendering for marketplace tab:
{activeTab === 'marketplace' ? (
  <MarketplaceTab />
) : (
  // existing content...
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/skills/SkillsPage.tsx
git commit -m "feat(web): integrate marketplace tab into skills page"
```

---

## Task 10: Integration Test

**Covers:** End-to-end verification

- [ ] **Step 1: Run all unit tests**

Run: `uv run pytest tests/D/unit/test_skill*.py -v`
Expected: All tests pass

- [ ] **Step 2: Run frontend typecheck**

Run: `pnpm --filter web typecheck`
Expected: No errors

- [ ] **Step 3: Run frontend lint**

Run: `pnpm --filter web lint`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `make test`
Expected: All tests pass

- [ ] **Step 5: Manual verification**

1. Start the dev server: `./run.sh start`
2. Navigate to Skills page
3. Click "市场" tab
4. Search for "python"
5. Verify results appear with Chinese descriptions
6. Click "安装" on a skill
7. Verify skill appears in user's skills list

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete skill marketplace feature

- Multi-source search (SkillsMP, GitHub)
- Category browsing
- Auto English-to-Chinese translation
- One-click install to user directory
- Security scanning for uploaded skills"
```

---

## Verification Checklist

- [ ] Backend API endpoints respond correctly
- [ ] Search returns results from multiple sources
- [ ] Categories filter works
- [ ] English descriptions translate to Chinese
- [ ] Install downloads skill to user directory
- [ ] Installed skills show correct status
- [ ] Security scanner blocks dangerous patterns
- [ ] Frontend renders correctly
- [ ] All unit tests pass
- [ ] Typecheck passes
- [ ] Lint passes
