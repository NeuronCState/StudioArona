"""Create vm table.

Revision ID: 008
Revises: 007
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vm",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("hypervisor", sa.Text, nullable=False),
        sa.Column("spec_cpu", sa.Integer, nullable=True),
        sa.Column("spec_ram_mb", sa.Integer, nullable=True),
        sa.Column("spec_disk_gb", sa.Integer, nullable=True),
        sa.Column("status", sa.Text, nullable=False, server_default="stopped"),
        sa.Column("ip", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("console_path", sa.Text, nullable=True),
        sa.Column(
            "guest_agent_ok",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "exec_enabled",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "name"),
    )


def downgrade() -> None:
    op.drop_table("vm")
