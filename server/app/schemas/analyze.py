"""Lesion analysis request/response schemas."""

from typing import List, Optional

from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    query_id: str


class AnalysisResult(BaseModel):
    reference_id: str
    diagnosis_label: Optional[str] = None
    diagnosis_type: Optional[str] = None
    score: float
    gcs_uri: Optional[str] = None


class AnalyzeResponse(BaseModel):
    benign_results: List[AnalysisResult]
    malignant_results: List[AnalysisResult]
