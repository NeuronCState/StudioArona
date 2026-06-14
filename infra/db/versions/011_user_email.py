"""Add users.email for notifications + drop invitation_code (replace with optional email).

Revision ID: 011
Revises: 005
Create Date: 2026-06-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users.email ─────────────────────────
    op.add_column(
        "users",
        sa.Column("email", sa.String(length=320), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    # ── Drop invitation_code (no longer used) ─────────
    # Keep the column for backward-compat with any in-flight registrations; just
    # the auth endpoint stops requiring it.
    # If you'd rather hard-drop, uncomment:
    # op.drop_column("users", "invitation_code")


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "email")
