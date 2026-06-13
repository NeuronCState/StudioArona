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
