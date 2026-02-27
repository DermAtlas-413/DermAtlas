"""Password hashing and JWT utilities.

Uses bcrypt directly (passlib 1.7.x is not compatible with bcrypt >= 4.x).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import jwt


def get_password_hash(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _get_settings():
    from app.core.config import get_settings

    return get_settings()


def create_access_token(
    data: dict,
    expires_delta_seconds: Optional[int] = None,
) -> str:
    settings = _get_settings()
    to_encode = data.copy()
    if expires_delta_seconds is not None:
        expire = datetime.now(timezone.utc) + timedelta(seconds=expires_delta_seconds)
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT. Raises jose.JWTError or jose.ExpiredSignatureError on failure."""
    settings = _get_settings()
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
