"""ReferenceAtlas ORM model."""

from __future__ import annotations

import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReferenceAtlas(Base):
    __tablename__ = "reference_atlas"

    reference_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    gcs_image_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    vertex_vector_id: Mapped[str] = mapped_column(String(100), nullable=False)
    diagnosis_label: Mapped[str] = mapped_column(String(255), nullable=False)
    diagnosis_type: Mapped[str] = mapped_column(String(50), nullable=False)
    modality: Mapped[str] = mapped_column(String(50), nullable=False)
    body_part: Mapped[str] = mapped_column(String(100), nullable=False)
    source_dataset: Mapped[str] = mapped_column(String(100), nullable=False)
