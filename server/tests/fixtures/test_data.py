"""Reusable constants and payload builders for tests."""

import io

# ---------------------------------------------------------------------------
# User constants
# ---------------------------------------------------------------------------

PCP_EMAIL = "dr.smith@hospital.org"
PCP_PASSWORD = "SecurePass123!"
PCP_FULL_NAME = "Dr. Alice Smith"
PCP_NPI = "1234567890"

PATIENT_EMAIL = "patient@example.com"
PATIENT_PASSWORD = "PatientPass456!"
PATIENT_FULL_NAME = "Bob Patient"

OTHER_PCP_EMAIL = "dr.jones@hospital.org"
OTHER_PCP_PASSWORD = "OtherPass789!"
OTHER_PCP_FULL_NAME = "Dr. Carol Jones"
OTHER_PCP_NPI = "0987654321"

# ---------------------------------------------------------------------------
# Patient constants
# ---------------------------------------------------------------------------

PATIENT_MRN = "MRN-001-TEST"
PATIENT_DOB = "1980-05-15"
PATIENT_GENDER = "M"

# ---------------------------------------------------------------------------
# Image constants
# ---------------------------------------------------------------------------

LESION_LOCATION = "left forearm"
CLINICIAN_NOTES = "Irregular border, asymmetric"
GCS_URI = "gs://dermatlas-test/images/test-image.jpg"
VERTEX_VECTOR_ID = "vec-123abc"

# ---------------------------------------------------------------------------
# Reference atlas constants
# ---------------------------------------------------------------------------

DIAGNOSIS_LABEL = "Melanoma"
DIAGNOSIS_TYPE = "Malignant"
REF_GCS_URI = "gs://dermatlas-ref/atlas/melanoma-001.jpg"
REF_VERTEX_ID = "ref-vec-456def"

BENIGN_DIAGNOSIS_LABEL = "Melanocytic Nevus"
BENIGN_DIAGNOSIS_TYPE = "Benign"
BENIGN_REF_GCS_URI = "gs://dermatlas-ref/atlas/nevus-001.jpg"
BENIGN_REF_VERTEX_ID = "ref-vec-benign-001"

MALIGNANT_DIAGNOSIS_TYPE = "Malignant"

# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------


def login_form(email: str = PCP_EMAIL, password: str = PCP_PASSWORD) -> dict:
    """Build an OAuth2 password grant form payload."""
    return {"username": email, "password": password}


def upload_form(patient_id: int = 1, lesion_location: str = LESION_LOCATION, clinician_notes: str = CLINICIAN_NOTES) -> dict:
    """Build multipart form fields for image upload (excluding the file itself)."""
    return {
        "patient_id": str(patient_id),
        "lesion_location": lesion_location,
        "clinician_notes": clinician_notes,
    }


def analyze_payload(query_id: str) -> dict:
    return {"query_id": query_id}


def feedback_payload(query_id: str, reference_id: str, is_helpful: bool = True) -> dict:
    return {
        "query_id": query_id,
        "reference_id": reference_id,
        "is_helpful": is_helpful,
    }


def make_jpeg_bytes() -> bytes:
    """Generate a minimal 1×1 pixel JPEG in memory via Pillow."""
    from PIL import Image

    buf = io.BytesIO()
    img = Image.new("RGB", (1, 1), color=(255, 0, 0))
    img.save(buf, format="JPEG")
    return buf.getvalue()


def make_png_bytes() -> bytes:
    """Generate a minimal 1×1 pixel PNG in memory via Pillow."""
    from PIL import Image

    buf = io.BytesIO()
    img = Image.new("RGB", (1, 1), color=(0, 255, 0))
    img.save(buf, format="PNG")
    return buf.getvalue()
