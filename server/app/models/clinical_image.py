"""ClinicalImage ORM model."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.db.base import Base


class ClinicalImage(Base):
    __tablename__ = "clinical_images"

    query_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False, index=True
    )
    patient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("patients.patient_id"), nullable=False, index=True
    )
    gcs_image_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    vertex_vector_id: Mapped[str | None] = mapped_column(String(100), nullable=True, default="")
    lesion_location: Mapped[str] = mapped_column(String(255), nullable=False)
    clinician_notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    visible_to_patient: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    embedding_vector: Mapped[Optional[list[float]]] = mapped_column(
        Vector(1408), nullable=True
    )
