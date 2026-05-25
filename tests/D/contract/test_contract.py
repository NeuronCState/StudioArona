"""Contract tests using schemathesis.

These tests validate that the API implementation matches the OpenAPI spec.
Run: uv run pytest tests/D/contract/ -v -m contract
"""

import pytest
import schemathesis
from fastapi.testclient import TestClient

from app.main import app

# Load OpenAPI spec from the running app
schema = schemathesis.from_asgi("/openapi.json", app=app)


@schema.parametrize()
@pytest.mark.contract
def test_api_contract(case):
    """Every endpoint in OpenAPI spec must respond correctly."""
    response = case.call_asgi(app=app)
    case.validate_response(response)
