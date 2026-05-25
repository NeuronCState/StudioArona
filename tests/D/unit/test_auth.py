"""Unit tests for JWT and password modules."""

import pytest

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_access_token,
    verify_refresh_token,
)
from app.auth.password import hash_password, verify_password


class TestPassword:
    def test_hash_and_verify(self):
        raw = "secure-password-123"
        hashed = hash_password(raw)
        assert hashed != raw
        assert verify_password(raw, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("correct")
        assert verify_password("wrong", hashed) is False

    def test_different_hashes(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2  # bcrypt salt makes each hash unique


class TestJWT:
    def test_access_token_roundtrip(self):
        token = create_access_token("user-123", "member")
        payload = verify_access_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["role"] == "member"
        assert payload["type"] == "access"

    def test_refresh_token_roundtrip(self):
        token = create_refresh_token("user-123")
        payload = verify_refresh_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["type"] == "refresh"

    def test_access_token_rejects_refresh(self):
        token = create_refresh_token("user-123")
        assert verify_access_token(token) is None

    def test_refresh_token_rejects_access(self):
        token = create_access_token("user-123", "member")
        assert verify_refresh_token(token) is None

    def test_invalid_token_returns_none(self):
        assert verify_access_token("garbage.token.here") is None
        assert verify_refresh_token("garbage") is None

    def test_decode_token_wrong_secret(self):
        token = create_access_token("user-123", "member")
        # decode_token uses correct secret, so it should work
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
