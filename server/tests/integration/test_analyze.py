"""
Integration tests for POST /api/v1/lesion/analyze.

TDD — these will be red until the analyze endpoint, Vertex AI service,
and audit log model are implemented.
"""


ANALYZE_URL = "/api/v1/lesion/analyze"


def _payload(query_id: str) -> dict:
    return {"query_id": query_id}


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_analyze_returns_200_with_results(
    client, pcp_token, clinical_image, reference_image, mock_vertex
):
    """POST with a valid query_id returns 200 and a results list."""
    # Configure mock to return one neighbour
    from unittest.mock import MagicMock

    neighbour = MagicMock()
    neighbour.id = str(reference_image.reference_id)
    neighbour.distance = 0.95
    mock_vertex.return_value.find_neighbors.return_value = [[neighbour]]

    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=pcp_token,
    )
    assert response.status_code == 200
    body = response.json()
    assert "results" in body
    assert isinstance(body["results"], list)


async def test_analyze_result_contains_reference_id_label_score_uri(
    client, pcp_token, clinical_image, reference_image, mock_vertex
):
    """Each result item must have reference_id, diagnosis_label, score, gcs_uri."""
    from unittest.mock import MagicMock

    neighbour = MagicMock()
    neighbour.id = str(reference_image.reference_id)
    neighbour.distance = 0.9
    mock_vertex.return_value.find_neighbors.return_value = [[neighbour]]

    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=pcp_token,
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) >= 1
    item = results[0]
    assert "reference_id" in item
    assert "diagnosis_label" in item
    assert "score" in item
    assert "gcs_uri" in item


async def test_analyze_returns_at_most_10_results(
    client, pcp_token, clinical_image, mock_vertex
):
    """Even if Vertex returns more, the endpoint caps results at 10."""
    from unittest.mock import MagicMock

    neighbours = []
    for i in range(15):
        n = MagicMock()
        n.id = str(i + 1000)
        n.distance = 0.9 - i * 0.01
        neighbours.append(n)
    mock_vertex.return_value.find_neighbors.return_value = [neighbours]

    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=pcp_token,
    )
    assert response.status_code == 200
    assert len(response.json()["results"]) == 10


async def test_analyze_empty_vector_results_returns_empty_list(
    client, pcp_token, clinical_image, mock_vertex
):
    """When Vertex returns no neighbours, results must be an empty list (not an error)."""
    mock_vertex.return_value.find_neighbors.return_value = [[]]

    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=pcp_token,
    )
    assert response.status_code == 200
    assert response.json()["results"] == []


# ---------------------------------------------------------------------------
# Authorization & validation
# ---------------------------------------------------------------------------


async def test_analyze_no_auth_returns_401(client, clinical_image):
    response = await client.post(ANALYZE_URL, json=_payload(str(clinical_image.query_id)))
    assert response.status_code == 401


async def test_analyze_patient_role_returns_403(
    client, patient_token, clinical_image
):
    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=patient_token,
    )
    assert response.status_code == 403


async def test_analyze_invalid_query_id_returns_404(client, pcp_token):
    response = await client.post(
        ANALYZE_URL,
        json={"query_id": "00000000-0000-0000-0000-000000000000"},
        headers=pcp_token,
    )
    assert response.status_code == 404


async def test_analyze_query_owned_by_other_physician_returns_403(
    client, other_pcp_token, clinical_image
):
    """A PCP cannot run analysis on another PCP's image."""
    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=other_pcp_token,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


async def test_analyze_missing_query_id_returns_422(client, pcp_token):
    """Missing required query_id field must return 422."""
    response = await client.post(ANALYZE_URL, json={}, headers=pcp_token)
    assert response.status_code == 422


async def test_analyze_vertex_ai_unavailable_returns_503(
    client, pcp_token, clinical_image, mock_vertex
):
    """Vertex AI failure returns 503."""
    mock_vertex.return_value.find_neighbors.side_effect = Exception("Vertex offline")

    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=pcp_token,
    )
    assert response.status_code == 503


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


async def test_analyze_creates_audit_log(
    client, pcp_token, pcp_user, clinical_image, db_session, mock_vertex
):
    """After a successful analyze call, an AuditLog row with action='ANALYZE' must exist."""
    from sqlalchemy import select
    from app.models.audit_log import AuditLog

    mock_vertex.return_value.find_neighbors.return_value = [[]]

    response = await client.post(
        ANALYZE_URL,
        json=_payload(str(clinical_image.query_id)),
        headers=pcp_token,
    )
    assert response.status_code == 200

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.user_id == pcp_user.user_id,
            AuditLog.action == "ANALYZE",
        )
    )
    log = result.scalar_one_or_none()
    assert log is not None
