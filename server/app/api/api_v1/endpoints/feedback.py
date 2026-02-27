"""POST /api/v1/feedback — Submit or update relevance feedback for a recommendation."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.recommendation_feedback import RecommendationFeedback
from app.models.reference_atlas import ReferenceAtlas
from app.models.user import User
from app.schemas.feedback import FeedbackRequest

router = APIRouter()


@router.post("/feedback", status_code=201)
async def submit_feedback(
    payload: FeedbackRequest,
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # --- Verify the query exists and belongs to this physician ---
    img_result = await db.execute(
        select(ClinicalImage).where(ClinicalImage.query_id == payload.query_id)
    )
    image = img_result.scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail="Query not found")
    if image.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access to this query is forbidden")

    # --- Verify the reference exists ---
    ref_result = await db.execute(
        select(ReferenceAtlas).where(ReferenceAtlas.reference_id == payload.reference_id)
    )
    if ref_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Reference image not found")

    # --- Upsert feedback (update if duplicate, insert if new) ---
    existing_result = await db.execute(
        select(RecommendationFeedback).where(
            RecommendationFeedback.query_id == payload.query_id,
            RecommendationFeedback.reference_id == payload.reference_id,
            RecommendationFeedback.user_id == current_user.user_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.is_helpful = payload.is_helpful
        existing.feedback_timestamp = datetime.now(timezone.utc)
        await db.flush()
    else:
        feedback = RecommendationFeedback(
            query_id=payload.query_id,
            reference_id=payload.reference_id,
            user_id=current_user.user_id,
            is_helpful=payload.is_helpful,
        )
        db.add(feedback)
        await db.flush()

    # --- Audit log ---
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="FEEDBACK",
            target_resource=f"query:{payload.query_id}",
        )
    )
    await db.flush()

    return {"status": "ok"}
