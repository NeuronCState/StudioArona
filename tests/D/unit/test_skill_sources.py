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
