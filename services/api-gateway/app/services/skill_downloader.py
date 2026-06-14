"""Download skills from external sources."""
from __future__ import annotations

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
                filename = raw_url.split("/")[-1] or "SKILL.md"
                return {filename: resp.text}
    except Exception:
        pass
    return {}


async def download_skill_folder(
    repo_url: str, folder_path: str = ""
) -> dict[str, str]:
    """Download all files from a GitHub folder.

    URL 形式: https://github.com/{owner}/{repo}/tree/{branch}/{path...}
    或         https://github.com/{owner}/{repo}/blob/{branch}/{file}
    """
    parts = repo_url.replace("https://github.com/", "").split("/")
    if len(parts) < 2:
        return {}

    owner, repo = parts[0], parts[1]
    # /tree/ 或 /blob/ 之后: parts[2] = 'tree' or 'blob', parts[3] = branch, parts[4:] = path
    if len(parts) > 3 and parts[2] in ("tree", "blob"):
        path = folder_path or "/".join(parts[4:])
    else:
        path = folder_path or ("/".join(parts[3:]) if len(parts) > 3 else "")

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


def mark_marketplace_skill(
    user_id: str, slug: str, source: str, source_url: str
) -> None:
    """Mark a skill directory as installed from marketplace (not user-written).

    写一个 .marketplace_source 文件到 skill dir, 之后 list_installed_skills
    通过这个标记判断是否是 marketplace 来源.
    """
    target_dir = get_user_skills_dir(user_id) / slug
    if not target_dir.exists():
        return
    (target_dir / ".marketplace_source").write_text(
        f"{source}\t{source_url}\n",
        encoding="utf-8",
    )


def remove_skill_from_user(user_id: str, slug: str) -> bool:
    """Remove a skill from user's directory."""
    skill_dir = get_user_skills_dir(user_id) / slug
    if skill_dir.exists():
        shutil.rmtree(skill_dir)
        return True
    return False
