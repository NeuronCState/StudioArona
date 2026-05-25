"""Shared test fixtures for perception service.

Inject services/perception into sys.path so `from app.*` resolves
to perception rather than api-gateway (which comes first in pythonpath).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure perception's `app` takes precedence over api-gateway's
_SVC = Path(__file__).parent.parent.parent / "services" / "perception"
if str(_SVC) not in sys.path:
    sys.path.insert(0, str(_SVC))

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
