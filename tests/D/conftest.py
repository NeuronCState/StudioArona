"""Shared fixtures for D tests."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Synchronous test client for FastAPI."""
    return TestClient(app)
