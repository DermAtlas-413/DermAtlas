"""POST /api/v1/lesion/analyze — Query Vertex AI vector search for similar atlas images."""

from __future__ import annotations

import logging

import vertexai
from google.cloud import aiplatform
from vertexai.vision_models import Image, MultiModalEmbeddingModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, Integer, func
from sqlalchemy.ext.asyncio import AsyncSession

from google.cloud import storage as gcs_storage

from app.core.config import get_settings
from app.core.deps import require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.clinical_image_prediction import ClinicalImagePrediction
from app.models.patient import Patient
from app.models.recommendation_feedback import RecommendationFeedback
from app.models.reference_atlas import ReferenceAtlas
from app.models.user import User
from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse, AnalysisResult
from app.services.ml_service import run_inference

logger = logging.getLogger(__name__)

router = APIRouter()

_TOP_PER_CATEGORY = 5
_VERTEX_NEIGHBORS = 25
_gcs_client: gcs_storage.Client | None = None
_signing_creds = None


def _get_signed_url(gcs_uri: str) -> str:
    """Generate a 1-hour signed URL for a GCS object."""
    import google.auth
    from google.auth.transport import requests as auth_requests
    from datetime import timedelta

    global _gcs_client, _signing_creds
    if _gcs_client is None:
        _gcs_client = gcs_storage.Client()
    if _signing_creds is None:
        _signing_creds, _ = google.auth.default()

    if hasattr(_signing_creds, "refresh"):
        _signing_creds.refresh(auth_requests.Request())

    without_prefix = gcs_uri[5:]  # strip "gs://"
    slash_idx = without_prefix.find("/")
    bucket_name = without_prefix[:slash_idx]
    blob_path = without_prefix[slash_idx + 1:]

    bucket = _gcs_client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
        service_account_email=_signing_creds.service_account_email,
        access_token=_signing_creds.token,
    )


def _get_image_embedding(gcs_uri: str) -> list[float]:
    """Generate a 1408-dim embedding for an image in GCS using Vertex AI multimodal model."""
    settings = get_settings()
    vertexai.init(project=settings.GCP_PROJECT_ID, location="us-central1")
    model = MultiModalEmbeddingModel.from_pretrained("multimodalembedding@001")
    image = Image(gcs_uri=gcs_uri)
    embeddings = model.get_embeddings(image=image)
    return embeddings.image_embedding


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

    # --- Generate embedding from the uploaded image ---
    try:
        embedding = _get_image_embedding(image.gcs_image_uri)
    except Exception:
        logger.exception("Failed to generate image embedding for %s", image.gcs_image_uri)
        raise HTTPException(status_code=503, detail="Image embedding service unavailable")

    # --- Query Vertex AI Vector Search ---
    settings = get_settings()
    try:
        endpoint = aiplatform.MatchingEngineIndexEndpoint(
            index_endpoint_name=settings.VERTEX_AI_INDEX_ENDPOINT
        )
        response = endpoint.find_neighbors(
            deployed_index_id="dermatlas_index_v2",
            queries=[embedding],
            num_neighbors=_VERTEX_NEIGHBORS,
        )
        neighbors = response[0] if response else []
    except Exception:
        logger.exception("Vertex AI vector search failed")
        raise HTTPException(status_code=503, detail="Vector search service unavailable")

    # --- Enrich with atlas metadata, preserving Vertex's score ordering ---
    enriched: list[AnalysisResult] = []
    neighbor_distances: list[float] = []
    retrieved_case_ids: list[str] = []

    for n in neighbors:
        ref_result = await db.execute(
            select(ReferenceAtlas).where(ReferenceAtlas.reference_id == n.id)
        )
        ref = ref_result.scalar_one_or_none()

        image_url: str | None = None
        if ref and ref.gcs_image_uri:
            try:
                image_url = _get_signed_url(ref.gcs_image_uri)
            except Exception:
                logger.warning("Failed to sign URL for %s", ref.gcs_image_uri)

        dist = float(n.distance) if n.distance is not None else 0.0
        neighbor_distances.append(dist)
        retrieved_case_ids.append(n.id)

        enriched.append(
            AnalysisResult(
                reference_id=n.id,
                diagnosis_label=ref.diagnosis_label if ref else None,
                diagnosis_type=ref.diagnosis_type if ref else None,
                score=dist,
                gcs_uri=image_url,
            )
        )

    # --- Partition into benign / malignant (case-insensitive), then cap each list ---
    benign_results: list[AnalysisResult] = []
    malignant_results: list[AnalysisResult] = []
    for r in enriched:
        dtype = (r.diagnosis_type or "").strip().lower()
        if dtype == "benign":
            benign_results.append(r)
        elif dtype == "malignant":
            malignant_results.append(r)

    benign_results = benign_results[:_TOP_PER_CATEGORY]
    malignant_results = malignant_results[:_TOP_PER_CATEGORY]

    # --- Fetch patient demographics for XGBoost features ---
    patient_result = await db.execute(
        select(Patient).where(Patient.patient_id == image.patient_id)
    )
    patient = patient_result.scalar_one_or_none()

    age: float | None = None
    if patient and patient.date_of_birth:
        try:
            from datetime import date
            dob = date.fromisoformat(patient.date_of_birth)
            age = float((date.today() - dob).days / 365.25)
        except Exception:
            pass

    sex = patient.gender if patient else None
    localization = image.lesion_location if image.lesion_location != "unspecified" else None

    # --- Run ML inference (MLP + XGBoost) ---
    try:
        ml_result = run_inference(
            embedding=embedding,
            neighbor_distances=neighbor_distances,
            age=age,
            sex=sex,
            localization=localization,
        )
    except Exception:
        logger.exception("ML inference failed for query %s", payload.query_id)
        raise HTTPException(status_code=503, detail="ML inference service unavailable")

    # --- Persist prediction record ---
    db.add(ClinicalImagePrediction(
        query_id=payload.query_id,
        model_version="mlp_v1+xgb_v1",
        predicted_probs=ml_result.predicted_probs,
        risk_flag=ml_result.risk_flag,
        primary_diagnosis=ml_result.primary_diagnosis,
        mel_probability=ml_result.predicted_probs.get("mel", 0.0),
        bcc_probability=ml_result.predicted_probs.get("bcc", 0.0),
        retrieved_case_ids=retrieved_case_ids,
        inference_time_ms=ml_result.inference_time_ms,
    ))

    # --- Physician feedback-based believability score ---
    # believability = malignancy_probability × physician_agreement_rate on retrieved neighbors
    believability_score: float | None = None
    if retrieved_case_ids:
        feedback_result = await db.execute(
            select(
                func.count().label("total"),
                func.sum(
                    RecommendationFeedback.is_helpful.cast(Integer)
                ).label("helpful"),
            ).where(
                RecommendationFeedback.reference_id.in_(retrieved_case_ids)
            )
        )
        row = feedback_result.one()
        total = row.total or 0
        helpful = row.helpful or 0
        if total > 0:
            agreement_rate = helpful / total
            believability_score = round(ml_result.malignancy_probability * agreement_rate, 4)

    # --- Audit log ---
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="ANALYZE",
            target_resource=f"query:{payload.query_id}",
        )
    )
    await db.flush()

    return AnalyzeResponse(
        benign_results=benign_results,
        malignant_results=malignant_results,
        predicted_probs=ml_result.predicted_probs,
        malignancy_probability=ml_result.malignancy_probability,
        risk_flag=ml_result.risk_flag,
        primary_diagnosis=ml_result.primary_diagnosis,
        believability_score=believability_score,
    )
