"""POST /api/v1/upload/image — Upload a clinical image to GCS and record metadata."""

from __future__ import annotations

import io
import uuid
from typing import Optional

import google.cloud.storage
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.patient import Patient
from app.models.user import User

router = APIRouter()

_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_TYPES = {"image/jpeg", "image/png"}


@router.post("/upload/image", status_code=201)
async def upload_image(
    file: UploadFile = File(...),
    patient_id: int = Form(...),
    lesion_location: str = Form(...),
    clinician_notes: Optional[str] = Form(None, max_length=2000),
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if clinician_notes is not None:
        stripped = clinician_notes.strip()
        clinician_notes = stripped if stripped else None
    # --- Validate content type ---
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG files are accepted")

    # --- Read and validate size ---
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(file_bytes) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    # --- Verify patient exists and belongs to this physician ---
    result = await db.execute(select(Patient).where(Patient.patient_id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if patient.primary_physician_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Patient not assigned to this physician")

    # --- Upload to GCS ---
    settings = get_settings()
    query_id = str(uuid.uuid4())
    bucket_name = settings.GCS_BUCKET_NAME or "dermatlas"
    blob_path = f"images/{query_id}/{file.filename or 'image'}"

    try:
        gcs_client = google.cloud.storage.Client()
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_file(io.BytesIO(file_bytes), content_type=file.content_type)
        gcs_uri = f"gs://{bucket_name}/{blob_path}"
    except Exception:
        raise HTTPException(status_code=503, detail="Image storage unavailable")

    # --- Persist record ---
    image = ClinicalImage(
        query_id=query_id,
        user_id=current_user.user_id,
        patient_id=patient_id,
        gcs_image_uri=gcs_uri,
        lesion_location=lesion_location,
        clinician_notes=clinician_notes,
    )
    db.add(image)
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="UPLOAD",
            target_resource=f"image:{query_id}",
        )
    )
    await db.flush()

    return {"query_id": query_id}
