"""Test health endpoint."""

from tests.D.conftest import client  # noqa: F401


def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "api-gateway"
