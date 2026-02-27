"""
Integration tests for POST /api/v1/feedback.

TDD — red until feedback endpoint + RecommendationFeedback model exist.
"""

import pytest

from tests.fixtures.test_data import feedback_payload

FEEDBACK_URL = "/api/v1/feedback"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_feedback_helpful_true_returns_201(
    client, pcp_token, clinical_image, reference_image
):
    payload = feedback_payload(
        str(clinical_image.query_id),
        str(reference_image.reference_id),
        is_helpful=True,
    )
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 201


async def test_feedback_helpful_false_returns_201(
    client, pcp_token, clinical_image, reference_image
):
    payload = feedback_payload(
        str(clinical_image.query_id),
        str(reference_image.reference_id),
        is_helpful=False,
    )
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 201


async def test_feedback_record_saved_to_db(
    client, pcp_token, pcp_user, clinical_image, reference_image, db_session
):
    """After POST, a RecommendationFeedback row must exist in the DB."""
    from sqlalchemy import select
    from app.models.recommendation_feedback import RecommendationFeedback

    payload = feedback_payload(
        str(clinical_image.query_id),
        str(reference_image.reference_id),
        is_helpful=True,
    )
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 201

    result = await db_session.execute(
        select(RecommendationFeedback).where(
            RecommendationFeedback.query_id == clinical_image.query_id,
            RecommendationFeedback.reference_id == reference_image.reference_id,
            RecommendationFeedback.user_id == pcp_user.user_id,
        )
    )
    row = result.scalar_one_or_none()
    assert row is not None
    assert row.is_helpful is True


# ---------------------------------------------------------------------------
# Authorization & validation
# ---------------------------------------------------------------------------


async def test_feedback_no_auth_returns_401(client, clinical_image, reference_image):
    payload = feedback_payload(str(clinical_image.query_id), str(reference_image.reference_id))
    response = await client.post(FEEDBACK_URL, json=payload)
    assert response.status_code == 401


async def test_feedback_patient_role_returns_403(
    client, patient_token, clinical_image, reference_image
):
    payload = feedback_payload(str(clinical_image.query_id), str(reference_image.reference_id))
    response = await client.post(FEEDBACK_URL, json=payload, headers=patient_token)
    assert response.status_code == 403


async def test_feedback_invalid_query_id_returns_404(
    client, pcp_token, reference_image
):
    payload = feedback_payload(
        "00000000-0000-0000-0000-000000000000",
        str(reference_image.reference_id),
    )
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 404


async def test_feedback_invalid_reference_id_returns_404(
    client, pcp_token, clinical_image
):
    payload = feedback_payload(
        str(clinical_image.query_id),
        "00000000-0000-0000-0000-000000000000",
    )
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 404


async def test_feedback_missing_is_helpful_returns_422(
    client, pcp_token, clinical_image, reference_image
):
    payload = {
        "query_id": str(clinical_image.query_id),
        "reference_id": str(reference_image.reference_id),
        # is_helpful omitted
    }
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 422


async def test_feedback_missing_query_id_returns_422(
    client, pcp_token, reference_image
):
    payload = {
        "reference_id": str(reference_image.reference_id),
        "is_helpful": True,
        # query_id omitted
    }
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 422


async def test_feedback_missing_reference_id_returns_422(
    client, pcp_token, clinical_image
):
    payload = {
        "query_id": str(clinical_image.query_id),
        "is_helpful": True,
        # reference_id omitted
    }
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 422


async def test_feedback_for_other_physicians_query_returns_403(
    client, other_pcp_token, clinical_image, reference_image
):
    """A PCP cannot submit feedback on another PCP's query."""
    payload = feedback_payload(str(clinical_image.query_id), str(reference_image.reference_id))
    response = await client.post(FEEDBACK_URL, json=payload, headers=other_pcp_token)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Business logic
# ---------------------------------------------------------------------------


async def test_feedback_duplicate_updates_existing_record(
    client, pcp_token, pcp_user, clinical_image, reference_image, db_session
):
    """Second POST with same (query_id, reference_id, user_id) updates is_helpful."""
    from sqlalchemy import select
    from app.models.recommendation_feedback import RecommendationFeedback

    payload_true = feedback_payload(
        str(clinical_image.query_id), str(reference_image.reference_id), is_helpful=True
    )
    payload_false = feedback_payload(
        str(clinical_image.query_id), str(reference_image.reference_id), is_helpful=False
    )

    resp1 = await client.post(FEEDBACK_URL, json=payload_true, headers=pcp_token)
    assert resp1.status_code == 201

    resp2 = await client.post(FEEDBACK_URL, json=payload_false, headers=pcp_token)
    assert resp2.status_code in (200, 201)  # upsert may return either

    result = await db_session.execute(
        select(RecommendationFeedback).where(
            RecommendationFeedback.query_id == clinical_image.query_id,
            RecommendationFeedback.reference_id == reference_image.reference_id,
            RecommendationFeedback.user_id == pcp_user.user_id,
        )
    )
    rows = result.scalars().all()
    assert len(rows) == 1  # no duplicate rows
    assert rows[0].is_helpful is False


async def test_feedback_creates_audit_log(
    client, pcp_token, pcp_user, clinical_image, reference_image, db_session
):
    """Feedback submission should create an AuditLog entry."""
    from sqlalchemy import select
    from app.models.audit_log import AuditLog

    payload = feedback_payload(
        str(clinical_image.query_id), str(reference_image.reference_id), is_helpful=True
    )
    response = await client.post(FEEDBACK_URL, json=payload, headers=pcp_token)
    assert response.status_code == 201

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.user_id == pcp_user.user_id,
            AuditLog.action == "FEEDBACK",
        )
    )
    log = result.scalar_one_or_none()
    assert log is not None
