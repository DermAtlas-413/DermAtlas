"""add last_login_at to users

Revision ID: d5e7f1a2b3c4
Revises: b7c3d8e21fa9
Create Date: 2026-04-22 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d5e7f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "b7c3d8e21fa9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "last_login_at")
