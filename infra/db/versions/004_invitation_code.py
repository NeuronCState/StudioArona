"""Add invitation_code to users.

Revision ID: 004
Revises: 003
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("invitation_code", sa.String(64), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "invitation_code")
