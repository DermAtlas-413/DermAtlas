"""
API v1 router aggregator.

Combines all endpoint routers into a single router for the v1 API.
"""

from fastapi import APIRouter

from app.api.api_v1.endpoints import health, submission

api_router = APIRouter()

api_router.include_router(
    health.router,
    tags=["health"],
)

api_router.include_router(
    submission.router,
    prefix="/submissions",
    tags=["submissions"],
)
