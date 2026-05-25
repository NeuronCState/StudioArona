"""Integration tests for auth flow: login → me → refresh → logout.

These tests require a running PostgreSQL + Redis (via docker-compose.test).
Mark as `integration` so CI can run them separately.
"""

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
def auth_client(client):
    """Test client with a seeded admin user (requires DB)."""
    return client


class TestAuthFlow:
    """End-to-end auth flow (requires running DB)."""

    def test_login_success(self, auth_client):
        """Login with seeded admin user."""
        resp = auth_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "admin"

    def test_login_wrong_password(self, auth_client):
        resp = auth_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "wrong"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"]["code"] == "JAVIS_AUTH_INVALID"

    def test_login_nonexistent_user(self, auth_client):
        resp = auth_client.post(
            "/api/auth/login",
            json={"username": "nobody", "password": "x"},
        )
        assert resp.status_code == 401

    def test_me_requires_auth(self, auth_client):
        resp = auth_client.get("/api/me")
        assert resp.status_code == 401

    def test_me_with_token(self, auth_client):
        # Login first
        login = auth_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        token = login.json()["access_token"]

        resp = auth_client.get(
            "/api/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["username"] == "admin"

    def test_refresh_token(self, auth_client):
        login = auth_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        refresh = login.json()["refresh_token"]

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_logout_returns_204(self, auth_client):
        resp = auth_client.post("/api/auth/logout")
        assert resp.status_code == 204
