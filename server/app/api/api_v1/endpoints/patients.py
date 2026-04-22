"""Patient endpoints — list, detail, case views, and visibility toggle."""

from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import aliased

from app.core.deps import get_current_user, require_network_admin, require_pcp
from app.core.gcs import sign_gcs_uri
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.schemas.patient import (
    AdminPatientOut,
    ClinicalImageDetail,
    ClinicalImageSummary,
    PatientMeResponse,
    PatientResponse,
    ReassignPhysicianIn,
    VisibilityUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _safe_sign(gcs_uri: str | None) -> str:
    """Sign a gs:// URI; return empty string on failure or if not a gs:// URI."""
    if not gcs_uri or not gcs_uri.startswith("gs://"):
        return gcs_uri or ""
    try:
        return sign_gcs_uri(gcs_uri)
    except Exception:
        logger.warning("Failed to sign URL for %s", gcs_uri)
        return ""


def _image_summary(img: ClinicalImage) -> ClinicalImageSummary:
    return ClinicalImageSummary(
        query_id=img.query_id,
        gcs_uri=_safe_sign(img.gcs_image_uri),
        captured_at=img.captured_at.isoformat() if img.captured_at else None,
        lesion_location=img.lesion_location,
        visible_to_patient=img.visible_to_patient,
    )


# ── Patient self-service ─────────────────────────────────────────────


@router.get("/patients/me", response_model=PatientMeResponse)
async def get_my_cases(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientMeResponse:
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Patient access only")

    patient_result = await db.execute(
        select(Patient).where(Patient.user_id == current_user.user_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="No patient record linked to this account")

    physician_name: str | None = None
    physician_result = await db.execute(
        select(User).where(User.user_id == patient.primary_physician_id)
    )
    physician = physician_result.scalar_one_or_none()
    if physician:
        physician_name = physician.full_name

    images_result = await db.execute(
        select(ClinicalImage)
        .where(
            ClinicalImage.patient_id == patient.patient_id,
            ClinicalImage.visible_to_patient.is_(True),
        )
        .order_by(ClinicalImage.captured_at.desc())
    )
    images = images_result.scalars().all()

    return PatientMeResponse(
        user_id=current_user.user_id,
        full_name=current_user.full_name,
        email=current_user.email,
        physician_name=physician_name,
        clinical_images=[_image_summary(img) for img in images],
    )


@router.get("/patients/me/cases/{query_id}", response_model=ClinicalImageDetail)
async def get_my_case_detail(
    query_id: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClinicalImageDetail:
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Patient access only")

    patient_result = await db.execute(
        select(Patient).where(Patient.user_id == current_user.user_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="No patient record linked to this account")

    img_result = await db.execute(
        select(ClinicalImage).where(
            ClinicalImage.query_id == query_id,
            ClinicalImage.patient_id == patient.patient_id,
        )
    )
    img = img_result.scalar_one_or_none()
    if img is None or not img.visible_to_patient:
        raise HTTPException(status_code=404, detail="Case not found")

    physician_result = await db.execute(
        select(User).where(User.user_id == img.user_id)
    )
    physician = physician_result.scalar_one_or_none()

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="VIEW_OWN_CASE",
            target_resource=f"image:{query_id}",
        )
    )
    await db.flush()

    return ClinicalImageDetail(
        query_id=img.query_id,
        gcs_uri=_safe_sign(img.gcs_image_uri),
        captured_at=img.captured_at.isoformat() if img.captured_at else None,
        lesion_location=img.lesion_location,
        clinician_notes=img.clinician_notes,
        visible_to_patient=img.visible_to_patient,
        physician_name=physician.full_name if physician else None,
    )


# ── PCP visibility toggle ────────────────────────────────────────────


@router.patch("/clinical-images/{query_id}/visibility")
async def toggle_visibility(
    body: VisibilityUpdate,
    query_id: str = Path(...),
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> dict:
    img_result = await db.execute(
        select(ClinicalImage).where(ClinicalImage.query_id == query_id)
    )
    img = img_result.scalar_one_or_none()
    if img is None:
        raise HTTPException(status_code=404, detail="Clinical image not found")
    if img.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not your clinical image")

    img.visible_to_patient = body.visible_to_patient
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="TOGGLE_VISIBILITY",
            target_resource=f"image:{query_id}",
        )
    )
    await db.flush()

    return {"query_id": query_id, "visible_to_patient": img.visible_to_patient}


# ── PCP patient management ───────────────────────────────────────────


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
                clinical_images=[_image_summary(img) for img in images],
            )
        )
    return responses


@router.get("/patients/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: int = Path(..., ge=1),
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> PatientResponse:
    result = await db.execute(select(Patient).where(Patient.patient_id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    if patient.primary_physician_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access to this patient is forbidden")

    images_result = await db.execute(
        select(ClinicalImage).where(ClinicalImage.patient_id == patient_id)
    )
    images = images_result.scalars().all()

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
        clinical_images=[_image_summary(img) for img in images],
    )


# ── Admin patient management (network-scoped) ────────────────────────


@router.get("/admin/patients", response_model=List[AdminPatientOut])
async def list_network_patients(
    current_user: User = Depends(require_network_admin),
    db: AsyncSession = Depends(get_db),
) -> List[AdminPatientOut]:
    """List every patient record in the admin's network, with current PCP."""
    PCP = aliased(User)
    PatientUser = aliased(User)
    result = await db.execute(
        select(Patient, PCP, PatientUser)
        .join(PCP, PCP.user_id == Patient.primary_physician_id)
        .outerjoin(PatientUser, PatientUser.user_id == Patient.user_id)
        .where(PCP.network_id == current_user.network_id)
        .order_by(Patient.patient_id)
    )
    return [
        AdminPatientOut(
            patient_id=patient.patient_id,
            mrn_internal=patient.mrn_internal,
            full_name=patient.full_name,
            date_of_birth=patient.date_of_birth,
            gender=patient.gender,
            user_id=patient_user.user_id if patient_user else None,
            patient_email=patient_user.email if patient_user else None,
            primary_physician_id=pcp.user_id,
            primary_physician_name=pcp.full_name,
            primary_physician_email=pcp.email,
        )
        for patient, pcp, patient_user in result.all()
    ]


@router.patch("/admin/patients/{patient_id}/physician", response_model=AdminPatientOut)
async def reassign_patient_physician(
    payload: ReassignPhysicianIn,
    patient_id: int = Path(..., ge=1),
    current_user: User = Depends(require_network_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminPatientOut:
    """Reassign a patient's primary physician. Both sides must be in-network."""
    patient_result = await db.execute(
        select(Patient).where(Patient.patient_id == patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    # The patient's current PCP must be in this admin's network.
    current_pcp_result = await db.execute(
        select(User).where(User.user_id == patient.primary_physician_id)
    )
    current_pcp = current_pcp_result.scalar_one_or_none()
    if current_pcp is None or current_pcp.network_id != current_user.network_id:
        raise HTTPException(status_code=404, detail="Patient not found")

    new_pcp_result = await db.execute(
        select(User).where(User.user_id == payload.physician_id)
    )
    new_pcp = new_pcp_result.scalar_one_or_none()
    if (
        new_pcp is None
        or new_pcp.role != UserRole.PCP
        or new_pcp.network_id != current_user.network_id
    ):
        raise HTTPException(
            status_code=400,
            detail="Target physician must be a PCP in your network",
        )

    patient.primary_physician_id = new_pcp.user_id

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="REASSIGN_PATIENT",
            target_resource=f"patient:{patient_id}->pcp:{new_pcp.user_id}",
        )
    )
    await db.flush()

    patient_user_result = await db.execute(
        select(User).where(User.user_id == patient.user_id)
    ) if patient.user_id else None
    patient_user = (
        patient_user_result.scalar_one_or_none() if patient_user_result else None
    )

    return AdminPatientOut(
        patient_id=patient.patient_id,
        mrn_internal=patient.mrn_internal,
        full_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        gender=patient.gender,
        user_id=patient_user.user_id if patient_user else None,
        patient_email=patient_user.email if patient_user else None,
        primary_physician_id=new_pcp.user_id,
        primary_physician_name=new_pcp.full_name,
        primary_physician_email=new_pcp.email,
    )
