"""
Integration tests for POST /api/v1/auth/token.

All tests use the OAuth2 password flow (application/x-www-form-urlencoded).
Tests are written contract-first (TDD): they will fail (red) until the
auth endpoint + User model + auth utilities are implemented.
"""

import pytest

from tests.fixtures.test_data import (
    OTHER_PCP_EMAIL,
    OTHER_PCP_PASSWORD,
    PATIENT_EMAIL,
    PATIENT_PASSWORD,
    PCP_EMAIL,
    PCP_PASSWORD,
    login_form,
)

AUTH_URL = "/api/v1/auth/token"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_login_success_returns_access_token(client, pcp_user):
    """Valid credentials return 200 with access_token and token_type."""
    response = await client.post(AUTH_URL, data=login_form())
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


async def test_login_pcp_token_includes_role(client, pcp_user):
    """PCP login: decoded token must carry role='PCP'."""
    from app.core.auth import decode_access_token

    response = await client.post(AUTH_URL, data=login_form(PCP_EMAIL, PCP_PASSWORD))
    assert response.status_code == 200
    token = response.json()["access_token"]
    payload = decode_access_token(token)
    assert payload["role"] == "PCP"


async def test_login_patient_token_includes_role(client, patient_user):
    """PATIENT login: decoded token must carry role='PATIENT'."""
    from app.core.auth import decode_access_token

    response = await client.post(
        AUTH_URL, data=login_form(PATIENT_EMAIL, PATIENT_PASSWORD)
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    payload = decode_access_token(token)
    assert payload["role"] == "PATIENT"


# ---------------------------------------------------------------------------
# Validation & security
# ---------------------------------------------------------------------------


async def test_login_wrong_password_returns_401(client, pcp_user):
    response = await client.post(
        AUTH_URL, data=login_form(PCP_EMAIL, "wrong_password")
    )
    assert response.status_code == 401


async def test_login_unknown_email_returns_401(client):
    """Non-existent user must return 401 (same error as wrong password — no enumeration)."""
    response = await client.post(
        AUTH_URL, data=login_form("nobody@nowhere.com", "irrelevant")
    )
    assert response.status_code == 401


async def test_login_missing_email_returns_422(client):
    response = await client.post(AUTH_URL, data={"password": PCP_PASSWORD})
    assert response.status_code == 422


async def test_login_missing_password_returns_422(client):
    response = await client.post(AUTH_URL, data={"username": PCP_EMAIL})
    assert response.status_code == 422


async def test_login_empty_string_email_returns_401(client):
    """Empty email string should be treated as an unknown user (401), not a server error."""
    response = await client.post(AUTH_URL, data=login_form("", PCP_PASSWORD))
    assert response.status_code == 401


async def test_login_sql_like_input_handled_safely(client):
    """SQL-injection-like input is treated as a literal string, returns 401."""
    response = await client.post(
        AUTH_URL, data=login_form("' OR 1=1 --", "anything")
    )
    assert response.status_code == 401


async def test_login_html_in_email_is_not_reflected(client):
    """XSS: HTML in email must not appear raw (unescaped) in the response body."""
    xss_payload = "<script>alert(1)</script>"
    response = await client.post(
        AUTH_URL, data=login_form(xss_payload, "anything")
    )
    assert xss_payload not in response.text


async def test_expired_token_returns_401(client, pcp_user):
    """A request with an already-expired JWT must return 401."""
    from app.core.auth import create_access_token

    expired_token = create_access_token({"sub": str(pcp_user.user_id), "role": "PCP"}, expires_delta_seconds=-1)
    response = await client.get(
        "/api/v1/patients/1",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401


async def test_malformed_token_returns_401(client, pcp_user):
    """A request with a garbage Bearer token must return 401."""
    response = await client.get(
        "/api/v1/patients/1",
        headers={"Authorization": "Bearer this.is.not.a.valid.jwt"},
    )
    assert response.status_code == 401


async def test_login_accepts_form_encoded_body(client, pcp_user):
    """Endpoint must accept application/x-www-form-urlencoded (OAuth2 standard)."""
    response = await client.post(
        AUTH_URL,
        content=f"username={PCP_EMAIL}&password={PCP_PASSWORD}",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
