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
    resp = await client.get(
        "/api/skills/marketplace/search", params={"q": "python"}
    )
    assert resp.status_code in (200, 422)


@pytest.mark.asyncio
async def test_install_endpoint_requires_body(client):
    resp = await client.post(
        "/api/skills/marketplace/install",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_installed_list(client):
    resp = await client.get(
        "/api/skills/marketplace/installed",
        headers={"X-User-Id": "test-user"},
    )
    assert resp.status_code == 200
    assert "skills" in resp.json()


@pytest.mark.asyncio
async def test_uninstall_nonexistent(client):
    resp = await client.delete(
        "/api/skills/marketplace/installed/nonexistent-skill",
        headers={"X-User-Id": "test-user", "Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 404
