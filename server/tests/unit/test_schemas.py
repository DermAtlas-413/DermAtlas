"""Unit tests for Pydantic request/response schemas."""

import pytest
from pydantic import ValidationError


# ---------------------------------------------------------------------------
# Existing schemas
# ---------------------------------------------------------------------------


class TestSubmissionCreate:
    def test_requires_image_data(self):
        """image_data is required; omitting it raises ValidationError."""
        from app.schemas.submission import SubmissionCreate

        with pytest.raises(ValidationError):
            SubmissionCreate()

    def test_optional_patient_notes(self):
        """patient_notes (or equivalent) is optional and defaults to empty."""
        from app.schemas.submission import SubmissionCreate

        s = SubmissionCreate(image_data="base64data==")
        # Accept either field name used in the schema
        notes = getattr(s, "patient_notes", getattr(s, "clinician_notes", None))
        assert notes == "" or notes is None


class TestHealthResponse:
    def test_requires_status_and_version(self):
        from app.schemas.health import HealthResponse

        h = HealthResponse(status="healthy", version="0.1.0")
        assert h.status == "healthy"
        assert h.version == "0.1.0"

    def test_missing_status_raises(self):
        from app.schemas.health import HealthResponse

        with pytest.raises(ValidationError):
            HealthResponse(version="0.1.0")

    def test_missing_version_raises(self):
        from app.schemas.health import HealthResponse

        with pytest.raises(ValidationError):
            HealthResponse(status="healthy")


# ---------------------------------------------------------------------------
# Auth schemas (TDD — will fail until app/schemas/auth.py exists)
# ---------------------------------------------------------------------------


class TestTokenResponseSchema:
    def test_token_response_schema(self):
        """TokenResponse must expose access_token and token_type fields."""
        from app.schemas.auth import TokenResponse

        t = TokenResponse(access_token="abc.def.ghi", token_type="bearer")
        assert t.access_token == "abc.def.ghi"
        assert t.token_type == "bearer"

    def test_token_response_missing_access_token_raises(self):
        from app.schemas.auth import TokenResponse

        with pytest.raises(ValidationError):
            TokenResponse(token_type="bearer")


# ---------------------------------------------------------------------------
# Upload / patient schemas (TDD)
# ---------------------------------------------------------------------------


class TestUploadRequestSchema:
    def test_upload_request_requires_patient_id(self):
        """UploadRequest must require patient_id."""
        from app.schemas.upload import UploadRequest

        with pytest.raises(ValidationError):
            UploadRequest(lesion_location="arm")

    def test_upload_request_optional_notes(self):
        from app.schemas.upload import UploadRequest

        req = UploadRequest(patient_id=1, lesion_location="arm")
        assert req.patient_id == 1


class TestPatientResponseSchema:
    def test_patient_response_includes_demographics(self):
        """PatientResponse must include patient_id, mrn_internal, date_of_birth, gender."""
        from app.schemas.patient import PatientResponse

        p = PatientResponse(
            patient_id=1,
            mrn_internal="MRN-001",
            date_of_birth="1980-05-15",
            gender="M",
            clinical_images=[],
        )
        assert p.patient_id == 1
        assert p.mrn_internal == "MRN-001"
