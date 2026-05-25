"""Extend audit_log table with tool_name, args_hash, status, latency_ms, result_truncated.

Revision ID: 009
Revises: 008
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_log", sa.Column("tool_name", sa.Text, nullable=True))
    op.add_column("audit_log", sa.Column("args_hash", sa.Text, nullable=True))
    op.add_column("audit_log", sa.Column("status", sa.Text, nullable=True))
    op.add_column("audit_log", sa.Column("latency_ms", sa.Integer, nullable=True))
    op.add_column("audit_log", sa.Column("result_truncated", sa.Text, nullable=True))
    op.create_index("idx_audit_user_ts", "audit_log", ["actor", sa.text("ts DESC")])


def downgrade() -> None:
    op.drop_index("idx_audit_user_ts")
    op.drop_column("audit_log", "result_truncated")
    op.drop_column("audit_log", "latency_ms")
    op.drop_column("audit_log", "status")
    op.drop_column("audit_log", "args_hash")
    op.drop_column("audit_log", "tool_name")
