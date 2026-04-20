"""Unit tests for Pydantic request/response schemas."""

import pytest
from pydantic import ValidationError


# ---------------------------------------------------------------------------
# Existing schemas
# ---------------------------------------------------------------------------


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


class TestClinicalImageSummarySchema:
    def test_required_fields(self):
        """ClinicalImageSummary must expose query_id, gcs_uri, lesion_location."""
        from app.schemas.patient import ClinicalImageSummary

        img = ClinicalImageSummary(
            query_id="abc-123",
            gcs_uri="gs://bucket/img.jpg",
            lesion_location="left arm",
        )
        assert img.query_id == "abc-123"
        assert img.gcs_uri == "gs://bucket/img.jpg"
        assert img.lesion_location == "left arm"

    def test_captured_at_is_optional(self):
        from app.schemas.patient import ClinicalImageSummary

        img = ClinicalImageSummary(
            query_id="abc-123",
            gcs_uri="gs://bucket/img.jpg",
            lesion_location="left arm",
        )
        assert img.captured_at is None


class TestAnalyzeRequestSchema:
    def test_requires_query_id(self):
        """AnalyzeRequest must require query_id."""
        from pydantic import ValidationError
        from app.schemas.analyze import AnalyzeRequest

        with pytest.raises(ValidationError):
            AnalyzeRequest()

    def test_accepts_query_id(self):
        from app.schemas.analyze import AnalyzeRequest

        req = AnalyzeRequest(query_id="abc-uuid")
        assert req.query_id == "abc-uuid"


class TestFeedbackRequestSchema:
    def test_requires_all_three_fields(self):
        """FeedbackRequest requires query_id, reference_id, and is_helpful."""
        from pydantic import ValidationError
        from app.schemas.feedback import FeedbackRequest

        with pytest.raises(ValidationError):
            FeedbackRequest(reference_id="ref-1", is_helpful=True)  # missing query_id

        with pytest.raises(ValidationError):
            FeedbackRequest(query_id="q-1", is_helpful=True)  # missing reference_id

        with pytest.raises(ValidationError):
            FeedbackRequest(query_id="q-1", reference_id="ref-1")  # missing is_helpful

    def test_accepts_valid_payload(self):
        from app.schemas.feedback import FeedbackRequest

        req = FeedbackRequest(query_id="q-1", reference_id="ref-1", is_helpful=False)
        assert req.query_id == "q-1"
        assert req.reference_id == "ref-1"
        assert req.is_helpful is False
