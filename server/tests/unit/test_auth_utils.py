"""Unit tests for JWT creation/verification and password hashing utilities."""


import pytest


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def test_password_hash_is_not_plaintext():
    """Hashed password must differ from the plaintext."""
    from app.core.auth import get_password_hash

    plain = "MySecret123!"
    hashed = get_password_hash(plain)
    assert hashed != plain


def test_verify_correct_password():
    """Correct plaintext password verifies against its hash."""
    from app.core.auth import get_password_hash, verify_password

    plain = "MySecret123!"
    hashed = get_password_hash(plain)
    assert verify_password(plain, hashed) is True


def test_verify_wrong_password_returns_false():
    """Wrong password returns False (not an exception)."""
    from app.core.auth import get_password_hash, verify_password

    hashed = get_password_hash("correct_password")
    assert verify_password("wrong_password", hashed) is False


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------


def test_create_access_token_returns_string():
    """create_access_token must return a non-empty string."""
    from app.core.auth import create_access_token

    token = create_access_token({"sub": "42", "role": "PCP"})
    assert isinstance(token, str)
    assert len(token) > 0


def test_token_contains_sub_claim():
    """Decoded token must contain the 'sub' claim we passed in."""
    from app.core.auth import create_access_token, decode_access_token

    token = create_access_token({"sub": "99", "role": "PCP"})
    payload = decode_access_token(token)
    assert payload["sub"] == "99"


def test_token_contains_role_claim():
    """Decoded token must contain the 'role' claim we passed in."""
    from app.core.auth import create_access_token, decode_access_token

    token = create_access_token({"sub": "1", "role": "PATIENT"})
    payload = decode_access_token(token)
    assert payload["role"] == "PATIENT"


def test_token_expires():
    """Token decoded after its TTL has elapsed should raise ExpiredSignatureError."""
    from jose import ExpiredSignatureError
    from app.core.auth import create_access_token, decode_access_token

    # Create a token that expired 1 second in the past
    token = create_access_token({"sub": "1", "role": "PCP"}, expires_delta_seconds=-1)
    with pytest.raises(ExpiredSignatureError):
        decode_access_token(token)


def test_decode_tampered_token_raises():
    """A token with a modified payload must fail signature verification."""
    from jose.exceptions import JWTError
    from app.core.auth import create_access_token, decode_access_token

    token = create_access_token({"sub": "1", "role": "PCP"})
    # Flip one character in the signature segment
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + "." + parts[2][:-1] + ("A" if parts[2][-1] != "A" else "B")
    with pytest.raises(JWTError):
        decode_access_token(tampered)
