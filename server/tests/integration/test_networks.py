"""Integration tests for network-scoped multi-tenancy.

Covers:
  * POST /auth/register-network creates a Network + admin user.
  * Cross-network isolation on GET /users.
  * Non-admin PCPs are 403'd from user CRUD.
  * Sole-admin protections on PATCH/DELETE.
"""
from __future__ import annotations

import pytest
import pytest_asyncio


# --------------------------------------------------------------------------- #
# Fixtures local to this file                                                 #
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def other_network_admin(db_session, other_network):
    """Admin PCP belonging to ``other_network`` (not the default one)."""
    from app.core.auth import get_password_hash
    from app.models.user import User, UserRole

    user = User(
        email="other.admin@otherhospital.org",
        password_hash=get_password_hash("OtherAdminPass1!"),
        full_name="Dr. Other Admin",
        role=UserRole.PCP,
        npi_number="9999999999",
        network_id=other_network.network_id,
        is_admin=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def other_network_admin_token(other_network_admin):
    from app.core.auth import create_access_token

    token = create_access_token({
        "sub": str(other_network_admin.user_id),
        "role": "PCP",
        "network_id": other_network_admin.network_id,
        "is_admin": True,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def non_admin_pcp_token(other_pcp_user):
    """other_pcp_user is in default_network with is_admin=False."""
    from app.core.auth import create_access_token

    token = create_access_token({
        "sub": str(other_pcp_user.user_id),
        "role": "PCP",
        "network_id": other_pcp_user.network_id,
        "is_admin": False,
    })
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# /auth/register-network                                                      #
# --------------------------------------------------------------------------- #


async def test_register_network_creates_network_and_admin(client):
    resp = await client.post(
        "/api/v1/auth/register-network",
        json={
            "network_name": "Brand New Hospital",
            "admin_email": "founder@brandnew.org",
            "admin_password": "FounderPass1!",
            "admin_full_name": "Dr. Founder",
            "admin_npi": "1112223334",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


async def test_register_network_returns_usable_token(client):
    resp = await client.post(
        "/api/v1/auth/register-network",
        json={
            "network_name": "Token Test Hospital",
            "admin_email": "founder2@token.org",
            "admin_password": "FounderPass1!",
            "admin_full_name": "Dr. Two",
            "admin_npi": "1112223335",
        },
    )
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = await client.get("/api/v1/users", headers=headers)
    assert me.status_code == 200
    users = me.json()
    # Brand new network only contains the admin themselves.
    assert len(users) == 1
    assert users[0]["email"] == "founder2@token.org"
    assert users[0]["is_admin"] is True


async def test_register_network_rejects_duplicate_name(client):
    payload = {
        "network_name": "Dup Hospital",
        "admin_email": "dup1@dup.org",
        "admin_password": "FounderPass1!",
        "admin_full_name": "Dr. Dup",
        "admin_npi": "1112223336",
    }
    first = await client.post("/api/v1/auth/register-network", json=payload)
    assert first.status_code == 201

    payload["admin_email"] = "dup2@dup.org"
    second = await client.post("/api/v1/auth/register-network", json=payload)
    assert second.status_code == 409


async def test_register_network_rejects_duplicate_email(client, pcp_user):
    resp = await client.post(
        "/api/v1/auth/register-network",
        json={
            "network_name": "Some Other Hospital",
            "admin_email": pcp_user.email,
            "admin_password": "FounderPass1!",
            "admin_full_name": "Dr. Dup Email",
            "admin_npi": "1112223337",
        },
    )
    assert resp.status_code == 409


# --------------------------------------------------------------------------- #
# Cross-network isolation                                                     #
# --------------------------------------------------------------------------- #


async def test_list_users_only_returns_callers_network(
    client, pcp_token, other_network_admin
):
    """A PCP in network A must not see other_network_admin (network B)."""
    resp = await client.get("/api/v1/users", headers=pcp_token)
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()}
    assert other_network_admin.email not in emails


async def test_admin_cannot_patch_user_in_other_network(
    client, pcp_token, other_network_admin
):
    """Targeting a user in another network returns 404 (not 403, no probing)."""
    resp = await client.patch(
        f"/api/v1/users/{other_network_admin.user_id}",
        headers=pcp_token,
        json={"full_name": "Hacked"},
    )
    assert resp.status_code == 404


async def test_admin_cannot_delete_user_in_other_network(
    client, pcp_token, other_network_admin
):
    resp = await client.delete(
        f"/api/v1/users/{other_network_admin.user_id}", headers=pcp_token
    )
    assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# Admin gating                                                                #
# --------------------------------------------------------------------------- #


async def test_non_admin_pcp_cannot_create_user(client, non_admin_pcp_token):
    resp = await client.post(
        "/api/v1/users",
        headers=non_admin_pcp_token,
        json={
            "email": "newperson@x.org",
            "full_name": "New",
            "role": "PATIENT",
            "password": "Whatever1!",
        },
    )
    assert resp.status_code == 403


async def test_non_admin_pcp_cannot_patch_user(
    client, non_admin_pcp_token, patient_user
):
    resp = await client.patch(
        f"/api/v1/users/{patient_user.user_id}",
        headers=non_admin_pcp_token,
        json={"full_name": "Renamed"},
    )
    assert resp.status_code == 403


async def test_non_admin_pcp_cannot_delete_user(
    client, non_admin_pcp_token, patient_user
):
    resp = await client.delete(
        f"/api/v1/users/{patient_user.user_id}", headers=non_admin_pcp_token
    )
    assert resp.status_code == 403


async def test_non_admin_pcp_can_still_list_users(client, non_admin_pcp_token):
    """Listing is read-only and allowed for any PCP (scoped to network)."""
    resp = await client.get("/api/v1/users", headers=non_admin_pcp_token)
    assert resp.status_code == 200


# --------------------------------------------------------------------------- #
# Sole-admin protections                                                      #
# --------------------------------------------------------------------------- #


async def test_sole_admin_cannot_demote_themselves(client, pcp_token, pcp_user):
    resp = await client.patch(
        f"/api/v1/users/{pcp_user.user_id}",
        headers=pcp_token,
        json={"is_admin": False},
    )
    assert resp.status_code == 400


async def test_sole_admin_cannot_change_own_role(client, pcp_token, pcp_user):
    resp = await client.patch(
        f"/api/v1/users/{pcp_user.user_id}",
        headers=pcp_token,
        json={"role": "PATIENT"},
    )
    assert resp.status_code == 400


async def test_sole_admin_cannot_delete_themselves(client, pcp_token, pcp_user):
    resp = await client.delete(
        f"/api/v1/users/{pcp_user.user_id}", headers=pcp_token
    )
    # The pre-existing self-delete guard returns 400 first.
    assert resp.status_code == 400


# --------------------------------------------------------------------------- #
# Admin grant rules                                                           #
# --------------------------------------------------------------------------- #


async def test_cannot_grant_admin_to_patient(client, pcp_token, patient_user):
    resp = await client.patch(
        f"/api/v1/users/{patient_user.user_id}",
        headers=pcp_token,
        json={"is_admin": True},
    )
    assert resp.status_code == 400


async def test_admin_can_promote_other_pcp(client, pcp_token, other_pcp_user):
    """Granting is_admin to a same-network PCP succeeds."""
    resp = await client.patch(
        f"/api/v1/users/{other_pcp_user.user_id}",
        headers=pcp_token,
        json={"is_admin": True},
    )
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True


async def test_created_user_inherits_admins_network(
    client, pcp_token, default_network
):
    resp = await client.post(
        "/api/v1/users",
        headers=pcp_token,
        json={
            "email": "newpat@x.org",
            "full_name": "New Pat",
            "role": "PATIENT",
            "password": "Whatever1!",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["network_id"] == default_network.network_id
    assert resp.json()["is_admin"] is False
