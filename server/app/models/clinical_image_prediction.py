"""ClinicalImagePrediction ORM model."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ClinicalImagePrediction(Base):
    """
    Stores classification predictions for clinical images.

    Each row represents one inference run for a clinical query.
    Tracks the XGBoost model output, risk flags, and retrieved similar cases.
    """
    __tablename__ = "clinical_image_predictions"

    prediction_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    query_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("clinical_images.query_id"), nullable=False, index=True
    )
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    predicted_probs: Mapped[dict] = mapped_column(JSON, nullable=False)
    risk_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, index=True)
    primary_diagnosis: Mapped[str] = mapped_column(String(100), nullable=False)
    mel_probability: Mapped[float] = mapped_column(Float, nullable=False)
    bcc_probability: Mapped[float] = mapped_column(Float, nullable=False)
    retrieved_case_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    inference_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
