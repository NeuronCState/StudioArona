"""Unit tests for SQLAlchemy model definitions."""

import pytest
from sqlalchemy import inspect

from app.models.audit import AuditLog
from app.models.user import User, UserFaceEmbedding, UserPreference


class TestUserModel:
    def test_table_name(self):
        assert User.__tablename__ == "users"

    def test_columns_exist(self):
        mapper = inspect(User)
        col_names = {c.key for c in mapper.columns}
        assert {"id", "username", "display_name", "password_hash", "role", "created_at", "updated_at"}.issubset(col_names)

    def test_username_is_unique(self):
        mapper = inspect(User)
        username_col = mapper.columns["username"]
        assert username_col.unique is True

    def test_role_default(self):
        mapper = inspect(User)
        role_col = mapper.columns["role"]
        # Python-side default is "member"
        assert role_col.default.arg == "member"


class TestUserPreferenceModel:
    def test_table_name(self):
        assert UserPreference.__tablename__ == "user_preferences"

    def test_user_id_fk(self):
        mapper = inspect(UserPreference)
        fk = list(mapper.columns["user_id"].foreign_keys)
        assert len(fk) == 1
        assert "users.id" in str(fk[0])


class TestAuditLogModel:
    def test_table_name(self):
        assert AuditLog.__tablename__ == "audit_log"

    def test_required_columns(self):
        mapper = inspect(AuditLog)
        col_names = {c.key for c in mapper.columns}
        assert {"id", "actor", "action", "ts"}.issubset(col_names)

    def test_optional_columns(self):
        mapper = inspect(AuditLog)
        target_col = mapper.columns["target"]
        assert target_col.nullable is True
