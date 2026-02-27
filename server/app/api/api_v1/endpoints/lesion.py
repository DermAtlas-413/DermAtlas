"""POST /api/v1/lesion/analyze — Query Vertex AI vector search for similar atlas images."""

from __future__ import annotations

from google.cloud import aiplatform
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.reference_atlas import ReferenceAtlas
from app.models.user import User
from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse, AnalysisResult

router = APIRouter()

_MAX_RESULTS = 10


@router.post("/lesion/analyze", response_model=AnalyzeResponse)
async def analyze_lesion(
    payload: AnalyzeRequest,
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> AnalyzeResponse:
    # --- Fetch and authorize the clinical image ---
    result = await db.execute(
        select(ClinicalImage).where(ClinicalImage.query_id == payload.query_id)
    )
    image = result.scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail="Query not found")
    if image.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access to this image is forbidden")

    # --- Query Vertex AI ---
    settings = get_settings()
    try:
        endpoint = aiplatform.MatchingEngineIndexEndpoint(
            index_endpoint_name=settings.VERTEX_AI_INDEX_ENDPOINT
        )
        response = endpoint.find_neighbors(
            deployed_index_id=settings.VERTEX_AI_INDEX_ENDPOINT,
            queries=[[0.0] * 128],
            num_neighbors=_MAX_RESULTS,
        )
        neighbors = response[0] if response else []
    except Exception:
        raise HTTPException(status_code=503, detail="Vector search service unavailable")

    # --- Cap results and enrich with atlas metadata ---
    neighbors = neighbors[:_MAX_RESULTS]
    results: list[AnalysisResult] = []
    for n in neighbors:
        ref_result = await db.execute(
            select(ReferenceAtlas).where(ReferenceAtlas.reference_id == n.id)
        )
        ref = ref_result.scalar_one_or_none()
        results.append(
            AnalysisResult(
                reference_id=n.id,
                diagnosis_label=ref.diagnosis_label if ref else None,
                score=float(n.distance),
                gcs_uri=ref.gcs_image_uri if ref else None,
            )
        )

    # --- Audit log ---
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="ANALYZE",
            target_resource=f"query:{payload.query_id}",
        )
    )
    await db.flush()

    return AnalyzeResponse(results=results)
