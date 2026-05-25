"""Create chat_sessions and chat_messages tables.

Revision ID: 003
Revises: 002
Create Date: 2026-05-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(256), nullable=True),
        sa.Column("mode", sa.String(16), nullable=False, server_default="text"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "summarized", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "session_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tool_call_json", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
    )

    op.execute(
        "CREATE INDEX idx_chat_messages_content_gin "
        "ON chat_messages USING gin(to_tsvector('simple', content))"
    )


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
