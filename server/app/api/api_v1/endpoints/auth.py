"""POST /api/v1/auth/token — OAuth2 password flow."""

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, get_password_hash, verify_password
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.network import Network
from app.models.user import User, UserRole
from app.schemas.auth import TokenResponse

router = APIRouter()


_SLUG_SAFE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    slug = _SLUG_SAFE.sub("-", name.strip().lower()).strip("-")
    return slug[:100] or "network"


@router.post("/auth/token", response_model=TokenResponse)
async def login(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Parse form manually so empty username → 401, missing field → 422.
    # OAuth2PasswordRequestForm rejects empty strings with 422 in Pydantic v2.
    form = await request.form()
    username = form.get("username")
    password = form.get("password")

    if username is None or password is None:
        raise HTTPException(
            status_code=422,
            detail=[{"msg": "username and password are required form fields"}],
        )

    result = await db.execute(select(User).where(User.email == username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(str(password), user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token({
        "sub": str(user.user_id),
        "role": user.role.value,
        "full_name": user.full_name,
        "email": user.email,
        "network_id": user.network_id,
        "is_admin": bool(user.is_admin),
    })

    db.add(
        AuditLog(
            user_id=user.user_id,
            action="LOGIN",
            target_resource=f"session:{user.email}",
        )
    )
    await db.flush()

    return TokenResponse(access_token=token)


class RegisterNetworkIn(BaseModel):
    network_name: str = Field(min_length=2, max_length=255)
    admin_email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    admin_password: str = Field(min_length=8, max_length=128)
    admin_full_name: str = Field(min_length=1, max_length=255)
    admin_npi: str = Field(min_length=10, max_length=10)


@router.post("/auth/register-network", response_model=TokenResponse, status_code=201)
async def register_network(
    payload: RegisterNetworkIn,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Public self-serve endpoint. Creates a Network + its first admin PCP."""
    slug = _slugify(payload.network_name)

    existing_slug = await db.execute(select(Network).where(Network.slug == slug))
    if existing_slug.scalar_one_or_none():
        raise HTTPException(
            status_code=409, detail="A network with this name already exists"
        )

    existing_email = await db.execute(
        select(User).where(User.email == payload.admin_email)
    )
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in use")

    network = Network(name=payload.network_name, slug=slug)
    db.add(network)
    await db.flush()

    admin = User(
        email=payload.admin_email,
        password_hash=get_password_hash(payload.admin_password),
        full_name=payload.admin_full_name,
        role=UserRole.PCP,
        npi_number=payload.admin_npi,
        network_id=network.network_id,
        is_admin=True,
    )
    db.add(admin)
    await db.flush()

    db.add(
        AuditLog(
            user_id=admin.user_id,
            action="REGISTER_NETWORK",
            target_resource=f"network:{network.network_id}",
        )
    )
    await db.flush()

    token = create_access_token({
        "sub": str(admin.user_id),
        "role": admin.role.value,
        "full_name": admin.full_name,
        "email": admin.email,
        "network_id": admin.network_id,
        "is_admin": True,
    })
    return TokenResponse(access_token=token)
