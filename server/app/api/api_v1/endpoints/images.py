"""GET /api/v1/images/proxy — Proxy GCS images to the browser via signed URLs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from app.core.deps import require_pcp
from app.core.gcs import parse_gcs_uri, sign_gcs_uri
from app.models.user import User

router = APIRouter()


@router.get("/images/proxy")
async def proxy_image(
    uri: str = Query(..., description="GCS URI (gs://bucket/path)"),
    _current_user: User = Depends(require_pcp),
) -> RedirectResponse:
    """Generate a short-lived signed URL for a GCS image and redirect to it."""
    if parse_gcs_uri(uri) is None:
        raise HTTPException(status_code=400, detail="Invalid GCS URI")

    try:
        signed_url = sign_gcs_uri(uri)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to generate image URL")

    return RedirectResponse(url=signed_url, status_code=302)
