"""API v1 router aggregator."""

from fastapi import APIRouter

from app.api.api_v1.endpoints import (
    auth,
    feedback,
    health,
    lesion,
    patients,
    submission,
    upload,
)

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(submission.router, prefix="/submissions", tags=["submissions"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(upload.router, tags=["upload"])
api_router.include_router(lesion.router, tags=["lesion"])
api_router.include_router(feedback.router, tags=["feedback"])
api_router.include_router(patients.router, tags=["patients"])
