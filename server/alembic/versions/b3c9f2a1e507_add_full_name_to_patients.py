"""add_full_name_to_patients

Revision ID: b3c9f2a1e507
Revises: a602b6610fd8
Create Date: 2026-04-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c9f2a1e507'
down_revision: Union[str, Sequence[str], None] = 'a602b6610fd8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'patients',
        sa.Column('full_name', sa.String(255), nullable=False, server_default='')
    )


def downgrade() -> None:
    op.drop_column('patients', 'full_name')
