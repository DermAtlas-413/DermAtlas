"""Health check endpoint."""

from fastapi import APIRouter

from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns the current status and version of the API.
    Used by Cloud Run for liveness/readiness probes.
    """
    return HealthResponse(
        status="healthy",
        version="0.1.0",
    )
