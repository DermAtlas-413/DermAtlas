"""Integration tests for the health check endpoint and root endpoint."""


async def test_health_returns_200(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200


async def test_health_response_schema(client):
    """Response body must contain 'status' and 'version' fields."""
    response = await client.get("/api/v1/health")
    data = response.json()
    assert "status" in data
    assert "version" in data
    assert data["status"] == "healthy"


# ---------------------------------------------------------------------------
# Root endpoint
# ---------------------------------------------------------------------------


async def test_root_endpoint_returns_200(client):
    """GET / must return 200 with a welcome payload."""
    response = await client.get("/")
    assert response.status_code == 200


async def test_root_endpoint_includes_docs_and_health_links(client):
    """GET / body must expose docs and health keys."""
    response = await client.get("/")
    body = response.json()
    assert "message" in body
    assert "docs" in body
    assert "health" in body
