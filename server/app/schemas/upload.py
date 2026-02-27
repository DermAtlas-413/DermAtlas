"""Upload request/response schemas."""

from typing import Optional

from pydantic import BaseModel


class UploadRequest(BaseModel):
    patient_id: int
    lesion_location: str
    clinician_notes: Optional[str] = None


class UploadResponse(BaseModel):
    query_id: str
