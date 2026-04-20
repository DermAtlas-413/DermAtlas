"""add patient user_id and visible_to_patient

Revision ID: c4d8e3f2a719
Revises: b3c9f2a1e507
Create Date: 2026-04-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d8e3f2a719'
down_revision: Union[str, Sequence[str], None] = 'b3c9f2a1e507'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'patients',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.user_id'), nullable=True, unique=True)
    )
    op.create_index('ix_patients_user_id', 'patients', ['user_id'])

    op.add_column(
        'clinical_images',
        sa.Column('visible_to_patient', sa.Boolean(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    op.drop_column('clinical_images', 'visible_to_patient')
    op.drop_index('ix_patients_user_id', table_name='patients')
    op.drop_column('patients', 'user_id')
