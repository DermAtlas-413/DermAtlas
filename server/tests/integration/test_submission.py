"""Integration tests for POST /api/v1/submissions (legacy placeholder endpoint).

The submission endpoint requires no auth and no database — it just generates a
UUID and returns a status payload.  These tests push its function body into
coverage and validate the contract.
"""

from __future__ import annotations

SUBMISSION_URL = "/api/v1/submissions"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_submission_returns_200(client):
    """Valid payload must return HTTP 200."""
    response = await client.post(
        SUBMISSION_URL,
        json={"image_data": "base64encodeddata=="},
    )
    assert response.status_code == 200


async def test_submission_response_includes_submission_id(client):
    """Response must include a non-empty submission_id string."""
    response = await client.post(
        SUBMISSION_URL,
        json={"image_data": "base64encodeddata=="},
    )
    assert response.status_code == 200
    body = response.json()
    assert "submission_id" in body
    assert isinstance(body["submission_id"], str)
    assert len(body["submission_id"]) > 0


async def test_submission_response_status_is_received(client):
    """Response status field must equal 'received'."""
    response = await client.post(
        SUBMISSION_URL,
        json={"image_data": "base64encodeddata=="},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "received"


async def test_submission_ids_are_unique(client):
    """Two consecutive submissions must produce different submission_ids."""
    r1 = await client.post(SUBMISSION_URL, json={"image_data": "aaa=="})
    r2 = await client.post(SUBMISSION_URL, json={"image_data": "bbb=="})
    assert r1.json()["submission_id"] != r2.json()["submission_id"]


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


async def test_submission_missing_image_data_returns_422(client):
    """Omitting the required image_data field must return HTTP 422."""
    response = await client.post(SUBMISSION_URL, json={})
    assert response.status_code == 422


async def test_submission_with_optional_notes_succeeds(client):
    """patient_notes (or clinician_notes) is optional; payload with it must still return 200."""
    response = await client.post(
        SUBMISSION_URL,
        json={"image_data": "base64data==", "patient_notes": "some notes"},
    )
    assert response.status_code == 200
