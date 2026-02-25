"""
Integration tests for POST /api/v1/upload/image.

TDD — these will be red until the upload endpoint, ClinicalImage model,
and GCS integration are implemented.
"""

import io

import pytest

from tests.fixtures.test_data import (
    CLINICIAN_NOTES,
    GCS_URI,
    LESION_LOCATION,
    make_jpeg_bytes,
    make_png_bytes,
)

UPLOAD_URL = "/api/v1/upload/image"


def _jpeg_file(data: bytes | None = None, filename: str = "test.jpg"):
    """Build a tuple suitable for httpx multipart files."""
    return ("file", (filename, io.BytesIO(data or make_jpeg_bytes()), "image/jpeg"))


def _png_file(data: bytes | None = None):
    return ("file", ("test.png", io.BytesIO(data or make_png_bytes()), "image/png"))


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_upload_jpeg_returns_201_with_query_id(
    client, pcp_token, patient_record, mock_gcs
):
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 201
    assert "query_id" in response.json()


async def test_upload_png_returns_201(client, pcp_token, patient_record, mock_gcs):
    response = await client.post(
        UPLOAD_URL,
        files=[_png_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 201


async def test_upload_creates_clinical_image_db_record(
    client, pcp_token, patient_record, db_session, mock_gcs
):
    """After upload, a ClinicalImage row should exist in the DB."""
    from sqlalchemy import select
    from app.models.clinical_image import ClinicalImage

    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 201
    query_id = response.json()["query_id"]

    result = await db_session.execute(
        select(ClinicalImage).where(ClinicalImage.query_id == query_id)
    )
    row = result.scalar_one_or_none()
    assert row is not None


async def test_upload_stores_clinician_notes(
    client, pcp_token, patient_record, db_session, mock_gcs
):
    from sqlalchemy import select
    from app.models.clinical_image import ClinicalImage

    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={
            "patient_id": str(patient_record.patient_id),
            "lesion_location": LESION_LOCATION,
            "clinician_notes": CLINICIAN_NOTES,
        },
        headers=pcp_token,
    )
    assert response.status_code == 201
    query_id = response.json()["query_id"]

    result = await db_session.execute(
        select(ClinicalImage).where(ClinicalImage.query_id == query_id)
    )
    row = result.scalar_one_or_none()
    assert row is not None
    assert row.clinician_notes == CLINICIAN_NOTES


async def test_upload_stores_lesion_location(
    client, pcp_token, patient_record, db_session, mock_gcs
):
    from sqlalchemy import select
    from app.models.clinical_image import ClinicalImage

    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 201
    query_id = response.json()["query_id"]

    result = await db_session.execute(
        select(ClinicalImage).where(ClinicalImage.query_id == query_id)
    )
    row = result.scalar_one_or_none()
    assert row.lesion_location == LESION_LOCATION


async def test_upload_gcs_uri_saved_to_db(
    client, pcp_token, patient_record, db_session, mock_gcs
):
    """The GCS URI returned by the mock must be persisted in the DB record."""
    from sqlalchemy import select
    from app.models.clinical_image import ClinicalImage

    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 201
    query_id = response.json()["query_id"]

    result = await db_session.execute(
        select(ClinicalImage).where(ClinicalImage.query_id == query_id)
    )
    row = result.scalar_one_or_none()
    assert row.gcs_image_uri is not None
    assert row.gcs_image_uri.startswith("gs://")


# ---------------------------------------------------------------------------
# Authorization & validation
# ---------------------------------------------------------------------------


async def test_upload_no_auth_returns_401(client, patient_record):
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
    )
    assert response.status_code == 401


async def test_upload_patient_role_returns_403(
    client, patient_token, patient_record
):
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=patient_token,
    )
    assert response.status_code == 403


async def test_upload_missing_file_returns_422(client, pcp_token, patient_record):
    response = await client.post(
        UPLOAD_URL,
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 422


async def test_upload_wrong_content_type_returns_400(
    client, pcp_token, patient_record
):
    """Uploading a text/plain file should be rejected with 400."""
    response = await client.post(
        UPLOAD_URL,
        files=[("file", ("test.txt", io.BytesIO(b"not an image"), "text/plain"))],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 400


async def test_upload_empty_file_returns_400(client, pcp_token, patient_record):
    """A 0-byte file upload should be rejected."""
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file(data=b"")],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 400


async def test_upload_file_too_large_returns_413(client, pcp_token, patient_record):
    """A file exceeding the size limit should return 413."""
    # 11 MB of zeros — larger than typical 10 MB limit
    big_data = b"\x00" * (11 * 1024 * 1024)
    response = await client.post(
        UPLOAD_URL,
        files=[("file", ("big.jpg", io.BytesIO(big_data), "image/jpeg"))],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 413


async def test_upload_requires_patient_id_returns_422(client, pcp_token):
    """patient_id is required; omitting it returns 422."""
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


async def test_upload_nonexistent_patient_returns_404(client, pcp_token):
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": "99999", "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 404


async def test_upload_patient_not_owned_by_physician_returns_403(
    client, other_pcp_token, patient_record
):
    """A physician cannot upload for a patient assigned to another physician."""
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=other_pcp_token,
    )
    assert response.status_code == 403


async def test_upload_gcs_failure_returns_503(
    client, pcp_token, patient_record, mocker
):
    """If GCS upload raises an exception, the endpoint returns 503."""
    mock = mocker.patch("google.cloud.storage.Client")
    mock.return_value.bucket.return_value.blob.return_value.upload_from_file.side_effect = (
        Exception("GCS unavailable")
    )
    response = await client.post(
        UPLOAD_URL,
        files=[_jpeg_file()],
        data={"patient_id": str(patient_record.patient_id), "lesion_location": LESION_LOCATION},
        headers=pcp_token,
    )
    assert response.status_code == 503
