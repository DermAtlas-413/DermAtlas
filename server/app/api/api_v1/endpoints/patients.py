"""Patient endpoints — list and detail views for PCP-owned patients."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.schemas.patient import ClinicalImageSummary, PatientMeResponse, PatientResponse

router = APIRouter()


@router.get("/patients/me", response_model=PatientMeResponse)
async def get_my_cases(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientMeResponse:
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Patient access only")

    images_result = await db.execute(
        select(ClinicalImage)
        .where(ClinicalImage.user_id == current_user.user_id)
        .order_by(ClinicalImage.captured_at.desc())
    )
    images = images_result.scalars().all()

    return PatientMeResponse(
        user_id=current_user.user_id,
        full_name=current_user.full_name,
        email=current_user.email,
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


@router.get("/patients", response_model=List[PatientResponse])
async def list_patients(
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> List[PatientResponse]:
    result = await db.execute(
        select(Patient).where(Patient.primary_physician_id == current_user.user_id)
    )
    patients = result.scalars().all()

    responses: list[PatientResponse] = []
    for patient in patients:
        images_result = await db.execute(
            select(ClinicalImage).where(ClinicalImage.patient_id == patient.patient_id)
        )
        images = images_result.scalars().all()
        responses.append(
            PatientResponse(
                patient_id=patient.patient_id,
                mrn_internal=patient.mrn_internal,
                full_name=patient.full_name,
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
        )
    return responses


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
        full_name=patient.full_name,
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
