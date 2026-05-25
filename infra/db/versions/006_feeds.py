"""Create feed and feed_item tables.

Revision ID: 006
Revises: 005
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feed",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=True),
        sa.Column("category", sa.Text, nullable=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "url"),
    )

    op.create_table(
        "feed_item",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "feed_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("feed.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("guid", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("link", sa.Text, nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("starred", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("feed_id", "guid"),
    )
    op.create_index(
        "idx_feed_item_feed_pub", "feed_item",
        ["feed_id", sa.text("published_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_feed_item_feed_pub")
    op.drop_table("feed_item")
    op.drop_table("feed")
