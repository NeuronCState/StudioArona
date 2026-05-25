"""Add avatar_url, profile_json, settings_json, last_login_at, memory_db_path to users.

Revision ID: 002
Revises: 001
Create Date: 2026-05-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(512), nullable=True))
    op.add_column(
        "users",
        sa.Column("profile_json", sa.Text, nullable=False, server_default="{}"),
    )
    op.add_column(
        "users",
        sa.Column("settings_json", sa.Text, nullable=False, server_default="{}"),
    )
    op.add_column(
        "users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users", sa.Column("memory_db_path", sa.String(512), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "memory_db_path")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "settings_json")
    op.drop_column("users", "profile_json")
    op.drop_column("users", "avatar_url")
