"""add embeddings and predictions

Revision ID: b7c3d8e21fa9
Revises: a602b6610fd8
Create Date: 2026-03-02 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = 'b7c3d8e21fa9'
down_revision: Union[str, Sequence[str], None] = 'a602b6610fd8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add embedding vectors and predictions table."""

    # Enable pgvector extension
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    # Add embedding_vector column to reference_atlas
    op.add_column(
        'reference_atlas',
        sa.Column('embedding_vector', Vector(1408), nullable=True)
    )

    # Add embedding_vector column to clinical_images (for caching query embeddings)
    op.add_column(
        'clinical_images',
        sa.Column('embedding_vector', Vector(1408), nullable=True)
    )

    # Create clinical_image_predictions table
    op.create_table(
        'clinical_image_predictions',
        sa.Column('prediction_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('query_id', sa.String(36), nullable=False),
        sa.Column('model_version', sa.String(50), nullable=False),
        sa.Column('predicted_probs', sa.JSON(), nullable=False),
        sa.Column('risk_flag', sa.Boolean(), nullable=False),
        sa.Column('primary_diagnosis', sa.String(100), nullable=False),
        sa.Column('mel_probability', sa.Float(), nullable=False),
        sa.Column('bcc_probability', sa.Float(), nullable=False),
        sa.Column('retrieved_case_ids', sa.JSON(), nullable=False),
        sa.Column('inference_time_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['query_id'], ['clinical_images.query_id'], ),
        sa.PrimaryKeyConstraint('prediction_id')
    )

    # Create indexes for performance
    op.create_index(
        'ix_clinical_image_predictions_query_id',
        'clinical_image_predictions',
        ['query_id'],
        unique=False
    )
    op.create_index(
        'ix_clinical_image_predictions_risk_flag',
        'clinical_image_predictions',
        ['risk_flag'],
        unique=False
    )
    op.create_index(
        'ix_clinical_image_predictions_created_at',
        'clinical_image_predictions',
        ['created_at'],
        unique=False
    )


def downgrade() -> None:
    """Rollback embeddings and predictions."""

    # Drop indexes
    op.drop_index('ix_clinical_image_predictions_created_at', table_name='clinical_image_predictions')
    op.drop_index('ix_clinical_image_predictions_risk_flag', table_name='clinical_image_predictions')
    op.drop_index('ix_clinical_image_predictions_query_id', table_name='clinical_image_predictions')

    # Drop predictions table
    op.drop_table('clinical_image_predictions')

    # Remove embedding columns
    op.drop_column('clinical_images', 'embedding_vector')
    op.drop_column('reference_atlas', 'embedding_vector')

    # Drop pgvector extension (optional - may be used by other tables)
    # op.execute('DROP EXTENSION IF EXISTS vector')
