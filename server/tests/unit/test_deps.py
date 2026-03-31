"""Unit tests for app/core/deps.py dependency functions.

Calls the dependency functions directly (not via HTTP) so that synchronous
code paths before any ``await`` are tracked by coverage.py.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# get_current_user — edge cases
# ---------------------------------------------------------------------------


async def test_get_current_user_token_missing_sub(db_session):
    """A valid JWT that has no 'sub' claim must raise HTTP 401."""
    from app.core.auth import create_access_token
    from app.core.deps import get_current_user

    # Token is cryptographically valid but lacks the 'sub' claim
    token = create_access_token({"role": "PCP"})

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=db_session)
    assert exc_info.value.status_code == 401


async def test_get_current_user_non_integer_sub_returns_401(db_session):
    """A token whose 'sub' is not parseable as int must raise HTTP 401 (ValueError path)."""
    from app.core.auth import create_access_token
    from app.core.deps import get_current_user

    token = create_access_token({"sub": "not-an-int", "role": "PCP"})

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=db_session)
    assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# require_pcp
# ---------------------------------------------------------------------------


async def test_require_pcp_raises_403_for_patient_role(db_session, patient_user):
    """require_pcp must raise HTTP 403 when the current user is a PATIENT."""
    from app.core.deps import require_pcp

    with pytest.raises(HTTPException) as exc_info:
        await require_pcp(current_user=patient_user)
    assert exc_info.value.status_code == 403


async def test_require_pcp_returns_user_for_pcp_role(db_session, pcp_user):
    """require_pcp must return the user unchanged when the role is PCP."""
    from app.core.deps import require_pcp

    result = await require_pcp(current_user=pcp_user)
    assert result is pcp_user
