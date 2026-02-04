"""Submission endpoints for image analysis."""

import uuid

from fastapi import APIRouter

from app.schemas.submission import SubmissionCreate, SubmissionResponse

router = APIRouter()


@router.post("", response_model=SubmissionResponse)
async def create_submission(submission: SubmissionCreate) -> SubmissionResponse:
    """
    Create a new image submission for analysis.

    This is a placeholder endpoint that will be implemented with:
    - Image upload to GCS
    - Vertex AI Vector Search for similar cases
    - Result retrieval and formatting

    Args:
        submission: The submission data including base64 image and optional notes.

    Returns:
        Submission response with ID and status.
    """
    # Generate a unique submission ID
    submission_id = str(uuid.uuid4())

    # TODO: Implement actual processing:
    # 1. Decode and validate image
    # 2. Upload to GCS
    # 3. Generate embedding via Vertex AI
    # 4. Query Vector Search index
    # 5. Return similar cases

    return SubmissionResponse(
        submission_id=submission_id,
        status="received",
        message="Submission received. Processing not yet implemented.",
    )
