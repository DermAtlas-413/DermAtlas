"""Integration tests for the health check endpoint."""


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
