"""
DermAtlas API - FastAPI Application Entry Point.

This is the main entry point for the DermAtlas backend API.
"""

from fastapi import FastAPI

from app.api.api_v1.api import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="Dermatology image analysis API powered by Vertex AI Vector Search",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Include API v1 routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint redirecting to API documentation."""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
