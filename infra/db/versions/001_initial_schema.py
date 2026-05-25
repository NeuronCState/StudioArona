"""Initial schema: users, user_preferences, user_face_embeddings, audit_log.

Revision ID: 001
Revises:
Create Date: 2026-05-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("username", sa.String(64), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="member"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── user_preferences ───────────────────
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("value_json", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── user_face_embeddings ───────────────
    op.create_table(
        "user_face_embeddings",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("embedding", sa.LargeBinary, nullable=False),
        sa.Column("source", sa.String(64), nullable=False, server_default="camera"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── audit_log ──────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("actor", sa.UUID(as_uuid=False), nullable=False, index=True),
        sa.Column("action", sa.String(64), nullable=False, index=True),
        sa.Column("target", sa.String(256), nullable=True),
        sa.Column("payload_hash", sa.String(64), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("user_face_embeddings")
    op.drop_table("user_preferences")
    op.drop_table("users")
