"""Health check response schema."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""

    status: str
    version: str
