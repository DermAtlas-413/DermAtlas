"""GET /api/v1/images/proxy — Proxy GCS images to the browser via signed URLs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from google.cloud import storage

from app.core.deps import require_pcp
from app.models.user import User

router = APIRouter()

_client: storage.Client | None = None


def _get_gcs_client() -> storage.Client:
    global _client
    if _client is None:
        _client = storage.Client()
    return _client


@router.get("/images/proxy")
async def proxy_image(
    uri: str = Query(..., description="GCS URI (gs://bucket/path)"),
    _current_user: User = Depends(require_pcp),
) -> RedirectResponse:
    """Generate a short-lived signed URL for a GCS image and redirect to it."""
    if not uri.startswith("gs://"):
        raise HTTPException(status_code=400, detail="Invalid GCS URI")

    # Parse gs://bucket/path
    without_prefix = uri[5:]
    slash_idx = without_prefix.find("/")
    if slash_idx < 0:
        raise HTTPException(status_code=400, detail="Invalid GCS URI format")

    bucket_name = without_prefix[:slash_idx]
    blob_path = without_prefix[slash_idx + 1:]

    try:
        client = _get_gcs_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=3600,  # 1 hour
            method="GET",
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to generate image URL")

    return RedirectResponse(url=signed_url, status_code=302)
