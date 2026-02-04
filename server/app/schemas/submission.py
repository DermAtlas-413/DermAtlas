"""Submission schemas for image analysis requests."""

from pydantic import BaseModel, Field


class SubmissionCreate(BaseModel):
    """Request model for creating a new submission."""

    image_data: str = Field(
        ...,
        description="Base64-encoded image data",
    )
    patient_notes: str = Field(
        default="",
        description="Optional notes about the patient or condition",
    )


class SubmissionResponse(BaseModel):
    """Response model for submission results."""

    submission_id: str = Field(
        ...,
        description="Unique identifier for this submission",
    )
    status: str = Field(
        ...,
        description="Processing status of the submission",
    )
    message: str = Field(
        default="",
        description="Additional information about the submission",
    )
