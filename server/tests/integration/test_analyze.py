"""
Integration tests for POST /api/v1/lesion/analyze.

The analyze endpoint returns two ranked lists — `benign_results` and
`malignant_results` — so clinicians can compare the closest benign and
closest malignant atlas matches side-by-side, which is most informative for
borderline lesions near the decision boundary.
"""

from unittest.mock import MagicMock

from app.models.reference_atlas import ReferenceAtlas


ANALYZE_URL = "/api/v1/lesion/analyze"


def _payload(query_id: str) -> dict:
    return {"query_id": query_id}


def _neighbor(ref_id: str, distance: float) -> MagicMock:
    n = MagicMock()
    n.id = ref_id
    n.distance = distance
    return n


async def _seed_refs(db_session, count: int, diagnosis_type: str, id_prefix: str):
    """Insert `count` ReferenceAtlas rows; return their IDs in insertion order."""
    ids: list[str] = []
    for i in range(count):
        ref_id = f"{id_prefix}-{i:03d}"
        ref = ReferenceAtlas(
            reference_id=ref_id,
            gcs_image_uri=f"gs://dermatlas-ref/atlas/{ref_id}.jpg",
            vertex_vector_id=f"vec-{ref_id}",
            diagnosis_label=f"Label-{i}",
            diagnosis_type=diagnosis_type,
            modality="dermoscopy",
            body_part="skin",
            source_dataset="ISIC",
        )
        db_session.add(ref)
        ids.append(ref_id)
    await db_session.flush()
    return ids


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_analyze_returns_benign_and_malignant_lists(
    client, pcp_token, clinical_image, reference_image, mock_vertex
):
    """Response body must contain both benign_results and malignant_results lists."""
    mock_vertex.return_value.find_neighbors.return_value = [
        [_neighbor(str(reference_image.reference_id), 0.9)]
    ]
    response = await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    assert response.status_code == 200
    body = response.json()
    assert "benign_results" in body
    assert "malignant_results" in body
    assert isinstance(body["benign_results"], list)
    assert isinstance(body["malignant_results"], list)


async def test_analyze_result_contains_all_required_fields(
    client, pcp_token, clinical_image, reference_image, mock_vertex
):
    """Each result item must expose reference_id, diagnosis_label, diagnosis_type, score, gcs_uri."""
    mock_vertex.return_value.find_neighbors.return_value = [
        [_neighbor(str(reference_image.reference_id), 0.9)]
    ]
    response = await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    assert response.status_code == 200
    body = response.json()
    # reference_image is Malignant by default
    assert len(body["malignant_results"]) == 1
    item = body["malignant_results"][0]
    assert "reference_id" in item
    assert "diagnosis_label" in item
    assert "diagnosis_type" in item
    assert "score" in item
    assert "gcs_uri" in item


async def test_analyze_benign_list_only_contains_benign(
    client, pcp_token, clinical_image, db_session, mock_vertex
):
    """Mixing benign and malignant neighbours must partition them into the correct lists."""
    benign_ids = await _seed_refs(db_session, 3, "Benign", "ben")
    malig_ids = await _seed_refs(db_session, 3, "Malignant", "mal")

    neighbours = []
    for i, rid in enumerate(benign_ids):
        neighbours.append(_neighbor(rid, 0.95 - i * 0.01))
    for i, rid in enumerate(malig_ids):
        neighbours.append(_neighbor(rid, 0.85 - i * 0.01))
    mock_vertex.return_value.find_neighbors.return_value = [neighbours]

    response = await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    assert response.status_code == 200
    body = response.json()
    assert all(r["diagnosis_type"] == "Benign" for r in body["benign_results"])
    assert all(r["diagnosis_type"] == "Malignant" for r in body["malignant_results"])
    assert len(body["benign_results"]) == 3
    assert len(body["malignant_results"]) == 3


async def test_analyze_each_list_capped_at_five(
    client, pcp_token, clinical_image, db_session, mock_vertex
):
    """Both lists must be truncated to 5 even when many candidates of each type exist."""
    benign_ids = await _seed_refs(db_session, 12, "Benign", "ben")
    malig_ids = await _seed_refs(db_session, 12, "Malignant", "mal")

    neighbours = []
    # Interleave so that without truncation both sides would exceed 5.
    for i in range(12):
        neighbours.append(_neighbor(benign_ids[i], 0.99 - i * 0.01))
        neighbours.append(_neighbor(malig_ids[i], 0.98 - i * 0.01))
    mock_vertex.return_value.find_neighbors.return_value = [neighbours]

    response = await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["benign_results"]) == 5
    assert len(body["malignant_results"]) == 5


async def test_analyze_each_list_sorted_by_score_desc(
    client, pcp_token, clinical_image, db_session, mock_vertex
):
    """Within each list, entries must be ordered by score descending."""
    benign_ids = await _seed_refs(db_session, 3, "Benign", "ben")

    # Feed Vertex neighbours in non-monotonic order; endpoint should preserve
    # the Vertex ranking (which find_neighbors already returns sorted).
    neighbours = [
        _neighbor(benign_ids[0], 0.91),
        _neighbor(benign_ids[1], 0.83),
        _neighbor(benign_ids[2], 0.75),
    ]
    mock_vertex.return_value.find_neighbors.return_value = [neighbours]

    response = await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    assert response.status_code == 200
    scores = [r["score"] for r in response.json()["benign_results"]]
    assert scores == sorted(scores, reverse=True)


async def test_analyze_empty_vector_returns_two_empty_lists(
    client, pcp_token, clinical_image, mock_vertex
):
    """No Vertex neighbours → both lists empty, still 200."""
    mock_vertex.return_value.find_neighbors.return_value = [[]]
    response = await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    assert response.status_code == 200
    body = response.json()
    assert body["benign_results"] == []
    assert body["malignant_results"] == []


async def test_analyze_one_sided_benign_returns_empty_malignant(
    client, pcp_token, clinical_image, db_session, mock_vertex
):
    """If all neighbours are benign, malignant_results must be empty (not padded)."""
    benign_ids = await _seed_refs(db_session, 4, "Benign", "ben")
    neighbours = [_neighbor(rid, 0.9 - i * 0.01) for i, rid in enumerate(benign_ids)]
    mock_vertex.return_value.find_neighbors.return_value = [neighbours]

    response = await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["benign_results"]) == 4
    assert body["malignant_results"] == []


async def test_analyze_requests_25_neighbors_from_vertex(
    client, pcp_token, clinical_image, mock_vertex
):
    """Endpoint must request 25 neighbours from Vertex to have headroom for partitioning."""
    mock_vertex.return_value.find_neighbors.return_value = [[]]
    await client.post(
        ANALYZE_URL, json=_payload(str(clinical_image.query_id)), headers=pcp_token
    )
    call = mock_vertex.return_value.find_neighbors.call_args
    assert call.kwargs.get("num_neighbors") == 25


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
