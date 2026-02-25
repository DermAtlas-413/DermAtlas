"""
Integration tests for GET /api/v1/patients/{patient_id}.

TDD — red until patients endpoint + Patient model + audit log are implemented.
"""

import pytest

PATIENTS_URL = "/api/v1/patients"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_get_patient_returns_200(client, pcp_token, patient_record):
    response = await client.get(
        f"{PATIENTS_URL}/{patient_record.patient_id}",
        headers=pcp_token,
    )
    assert response.status_code == 200


async def test_get_patient_response_includes_demographics(
    client, pcp_token, patient_record
):
    """Response body must include mrn_internal, date_of_birth, gender."""
    response = await client.get(
        f"{PATIENTS_URL}/{patient_record.patient_id}",
        headers=pcp_token,
    )
    assert response.status_code == 200
    data = response.json()
    assert "mrn_internal" in data
    assert "date_of_birth" in data
    assert "gender" in data


async def test_get_patient_response_includes_clinical_images_list(
    client, pcp_token, patient_record, clinical_image
):
    """Response must include a 'clinical_images' list."""
    response = await client.get(
        f"{PATIENTS_URL}/{patient_record.patient_id}",
        headers=pcp_token,
    )
    assert response.status_code == 200
    data = response.json()
    assert "clinical_images" in data
    assert isinstance(data["clinical_images"], list)
    assert len(data["clinical_images"]) >= 1


async def test_get_patient_images_have_correct_fields(
    client, pcp_token, patient_record, clinical_image
):
    """Each clinical image in the list must have query_id, gcs_uri, captured_at, lesion_location."""
    response = await client.get(
        f"{PATIENTS_URL}/{patient_record.patient_id}",
        headers=pcp_token,
    )
    assert response.status_code == 200
    images = response.json()["clinical_images"]
    assert len(images) >= 1
    img = images[0]
    assert "query_id" in img
    assert "gcs_uri" in img
    assert "captured_at" in img
    assert "lesion_location" in img


# ---------------------------------------------------------------------------
# Authorization & validation
# ---------------------------------------------------------------------------


async def test_get_patient_no_auth_returns_401(client, patient_record):
    response = await client.get(f"{PATIENTS_URL}/{patient_record.patient_id}")
    assert response.status_code == 401


async def test_get_patient_patient_role_returns_403(
    client, patient_token, patient_record
):
    response = await client.get(
        f"{PATIENTS_URL}/{patient_record.patient_id}",
        headers=patient_token,
    )
    assert response.status_code == 403


async def test_get_patient_nonexistent_returns_404(client, pcp_token):
    response = await client.get(f"{PATIENTS_URL}/99999", headers=pcp_token)
    assert response.status_code == 404


async def test_get_patient_other_physicians_patient_returns_403(
    client, other_pcp_token, patient_record
):
    """A PCP cannot access a patient belonging to a different physician."""
    response = await client.get(
        f"{PATIENTS_URL}/{patient_record.patient_id}",
        headers=other_pcp_token,
    )
    assert response.status_code == 403


async def test_get_patient_string_id_returns_422(client, pcp_token):
    """Non-integer patient_id in the path should return 422."""
    response = await client.get(f"{PATIENTS_URL}/not-an-id", headers=pcp_token)
    assert response.status_code == 422


async def test_get_patient_negative_id_returns_422(client, pcp_token):
    """Negative patient_id should be rejected as invalid."""
    response = await client.get(f"{PATIENTS_URL}/-1", headers=pcp_token)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Audit & HIPAA
# ---------------------------------------------------------------------------


async def test_get_patient_creates_audit_log(
    client, pcp_token, pcp_user, patient_record, db_session
):
    """Accessing a patient record must create an AuditLog entry (HIPAA compliance)."""
    from sqlalchemy import select
    from app.models.audit_log import AuditLog

    response = await client.get(
        f"{PATIENTS_URL}/{patient_record.patient_id}",
        headers=pcp_token,
    )
    assert response.status_code == 200

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.user_id == pcp_user.user_id,
            AuditLog.action == "VIEW_PATIENT",
        )
    )
    log = result.scalar_one_or_none()
    assert log is not None
    assert str(patient_record.patient_id) in str(log.target_resource)
