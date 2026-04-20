"""
DermAtlas API - FastAPI Application Entry Point.

This is the main entry point for the DermAtlas backend API.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_v1.api import api_router
from app.core.config import get_settings
from app.db import close_db_engine, init_db_engine

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db_engine()
    yield
    await close_db_engine()


app = FastAPI(
    title=settings.APP_NAME,
    description="Dermatology image analysis API powered by Vertex AI Vector Search",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

_raw = settings.ALLOWED_ORIGINS.strip()
if _raw:
    _origins: list[str] = [o.strip() for o in _raw.split(",") if o.strip()]
else:
    if settings.ENV in ("staging", "production"):
        raise RuntimeError(
            f"ALLOWED_ORIGINS must be set for ENV={settings.ENV}. "
            "Set it to your Netlify URL (e.g. https://your-site.netlify.app)."
        )
    _origins = ["http://localhost:8081", "http://localhost:19006"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
