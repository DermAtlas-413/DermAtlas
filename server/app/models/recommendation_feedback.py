"""RecommendationFeedback ORM model."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"
    __table_args__ = (
        UniqueConstraint("query_id", "reference_id", "user_id", name="uq_feedback_triple"),
    )

    feedback_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("clinical_images.query_id"), nullable=False, index=True
    )
    reference_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("reference_atlas.reference_id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id"), nullable=False, index=True
    )
    is_helpful: Mapped[bool] = mapped_column(Boolean, nullable=False)
    feedback_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
