"""Create memory_entry table.

Revision ID: 007
Revises: 006
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "memory_entry",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tags", ARRAY(sa.Text), nullable=True),
        sa.Column(
            "source_msg_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("chat_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("weight", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_memory_user_kind", "memory_entry", ["user_id", "kind"])


def downgrade() -> None:
    op.drop_index("idx_memory_user_kind")
    op.drop_table("memory_entry")
