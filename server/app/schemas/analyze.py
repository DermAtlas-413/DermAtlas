"""Lesion analysis request/response schemas."""

from typing import Dict, List, Optional

from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    query_id: str


class AnalysisResult(BaseModel):
    reference_id: str
    diagnosis_label: Optional[str] = None
    score: float
    gcs_uri: Optional[str] = None


class AnalyzeResponse(BaseModel):
    results: List[AnalysisResult]
    predicted_probs: Dict[str, float]
    malignancy_probability: float
    risk_flag: bool
    primary_diagnosis: str
