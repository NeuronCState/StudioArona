"""page_monitor — web page change monitoring

Revision ID: 010
Revises: 009
Create Date: 2026-05-23
"""

from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"


def upgrade():
    op.create_table(
        "page_monitor",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("css_selector", sa.Text(), server_default="body"),
        sa.Column("last_hash", sa.Text()),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("last_changed_at", sa.DateTime(timezone=True)),
        sa.Column("check_interval_min", sa.Integer(), server_default="60"),
        sa.Column("enabled", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_page_monitor_user_id", "page_monitor", ["user_id"])


def downgrade():
    op.drop_table("page_monitor")
