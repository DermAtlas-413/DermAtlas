"""Patient response schemas."""

from typing import List, Optional

from pydantic import BaseModel


class ClinicalImageSummary(BaseModel):
    query_id: str
    gcs_uri: str
    captured_at: Optional[str] = None
    lesion_location: str


class PatientResponse(BaseModel):
    patient_id: int
    mrn_internal: str
    date_of_birth: str
    gender: str
    clinical_images: List[ClinicalImageSummary]
