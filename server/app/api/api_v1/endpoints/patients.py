"""GET /api/v1/patients/{patient_id} — Retrieve patient demographics and image history."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.patient import Patient
from app.models.user import User
from app.schemas.patient import ClinicalImageSummary, PatientResponse

router = APIRouter()


@router.get("/patients/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: int = Path(..., ge=1),
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    # --- Fetch patient ---
    result = await db.execute(select(Patient).where(Patient.patient_id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if patient.primary_physician_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access to this patient is forbidden")

    # --- Fetch clinical images ---
    images_result = await db.execute(
        select(ClinicalImage).where(ClinicalImage.patient_id == patient_id)
    )
    images = images_result.scalars().all()

    # --- Audit log (HIPAA) ---
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="VIEW_PATIENT",
            target_resource=f"patient:{patient_id}",
        )
    )
    await db.flush()

    return PatientResponse(
        patient_id=patient.patient_id,
        mrn_internal=patient.mrn_internal,
        date_of_birth=patient.date_of_birth,
        gender=patient.gender,
        clinical_images=[
            ClinicalImageSummary(
                query_id=img.query_id,
                gcs_uri=img.gcs_image_uri,
                captured_at=img.captured_at.isoformat() if img.captured_at else None,
                lesion_location=img.lesion_location,
            )
            for img in images
        ],
    )
