"""GCS helpers — single source of truth for signing image URLs.

This mirrors the signing mechanism used by `/lesion/analyze`, which has
been working in production. Callers should wrap calls in try/except if
they want to tolerate failures (e.g. local dev without ADC).
"""

from __future__ import annotations

from datetime import timedelta

import google.auth
from google.auth.transport import requests as auth_requests
from google.cloud import storage as gcs_storage

_gcs_client: gcs_storage.Client | None = None
_signing_creds = None


def parse_gcs_uri(uri: str) -> tuple[str, str] | None:
    """Split gs://bucket/path into (bucket, path). Returns None if malformed."""
    if not uri or not uri.startswith("gs://"):
        return None
    rest = uri[5:]
    slash = rest.find("/")
    if slash <= 0 or slash == len(rest) - 1:
        return None
    return rest[:slash], rest[slash + 1 :]


def sign_gcs_uri(gcs_uri: str) -> str:
    """Generate a 1-hour signed URL for a GCS object.

    Identical mechanism to `lesion.py._get_signed_url`. Raises on failure
    (network error, missing creds attrs, malformed URI) — callers must
    handle exceptions if they want to tolerate signing failures.
    """
    global _gcs_client, _signing_creds
    if _gcs_client is None:
        _gcs_client = gcs_storage.Client()
    if _signing_creds is None:
        _signing_creds, _ = google.auth.default()

    if hasattr(_signing_creds, "refresh"):
        _signing_creds.refresh(auth_requests.Request())

    without_prefix = gcs_uri[5:]  # strip "gs://"
    slash_idx = without_prefix.find("/")
    bucket_name = without_prefix[:slash_idx]
    blob_path = without_prefix[slash_idx + 1:]

    bucket = _gcs_client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
        service_account_email=_signing_creds.service_account_email,
        access_token=_signing_creds.token,
    )
