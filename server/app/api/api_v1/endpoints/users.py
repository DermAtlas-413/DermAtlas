"""User management endpoints — network-scoped CRUD for network admins."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_password_hash
from app.core.deps import require_network_admin, require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole

router = APIRouter()


# ---------- Schemas ----------

class UserOut(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    is_admin: bool
    network_id: int
    created_at: str
    last_login: str | None = None


class CreateUserIn(BaseModel):
    email: str
    full_name: str
    role: str
    password: str


class UpdateUserIn(BaseModel):
    email: str | None = None
    full_name: str | None = None
    role: str | None = None
    is_admin: bool | None = None


def _user_to_out(u: User) -> UserOut:
    return UserOut(
        user_id=str(u.user_id),
        email=u.email,
        full_name=u.full_name,
        role=u.role.value,
        is_active=True,
        is_admin=bool(u.is_admin),
        network_id=u.network_id,
        created_at=u.created_at.isoformat() if u.created_at else "",
        last_login=None,
    )


# ---------- Endpoints ----------

@router.get("/users", response_model=list[UserOut])
async def list_users(
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> list[UserOut]:
    # Scope strictly to the caller's network — callers never see users in
    # other hospitals. Inside their network, PCPs see all users (PCPs for
    # referrals, patients they may need to look up by name).
    result = await db.execute(
        select(User)
        .where(User.network_id == current_user.network_id)
        .order_by(User.user_id)
    )
    return [_user_to_out(u) for u in result.scalars().all()]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    payload: CreateUserIn,
    current_user: User = Depends(require_network_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in use")

    role = UserRole(payload.role) if payload.role in ("PCP", "PATIENT") else UserRole.PATIENT

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=get_password_hash(payload.password),
        role=role,
        network_id=current_user.network_id,
        is_admin=False,
    )
    db.add(user)
    await db.flush()

    db.add(AuditLog(
        user_id=current_user.user_id,
        action="CREATE_USER",
        target_resource=f"user:{user.user_id}",
    ))
    await db.flush()

    return _user_to_out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UpdateUserIn,
    current_user: User = Depends(require_network_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    result = await db.execute(
        select(User).where(
            and_(User.user_id == user_id, User.network_id == current_user.network_id)
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        # 404 (not 403) for out-of-network targets so callers can't probe
        # other networks' user IDs.
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        dup = await db.execute(
            select(User).where(User.email == payload.email, User.user_id != user_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already in use")
        user.email = payload.email

    if payload.full_name is not None:
        user.full_name = payload.full_name

    if payload.role is not None and payload.role in ("PCP", "PATIENT"):
        new_role = UserRole(payload.role)
        # Admin cannot demote themselves out of the PCP role; that would
        # orphan the network's only admin seat.
        if user.user_id == current_user.user_id and new_role != UserRole.PCP:
            raise HTTPException(status_code=400, detail="Cannot change your own role")
        # A role change away from PCP must also clear is_admin.
        if new_role != UserRole.PCP:
            if user.is_admin and await _is_sole_admin(db, user):
                raise HTTPException(
                    status_code=400,
                    detail="Cannot demote the only admin of the network",
                )
            user.is_admin = False
        user.role = new_role

    if payload.is_admin is not None:
        if payload.is_admin and user.role != UserRole.PCP:
            raise HTTPException(
                status_code=400, detail="Only PCPs can be network admins"
            )
        if (
            payload.is_admin is False
            and user.is_admin
            and await _is_sole_admin(db, user)
        ):
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the only admin of the network",
            )
        user.is_admin = payload.is_admin

    await db.flush()

    db.add(AuditLog(
        user_id=current_user.user_id,
        action="UPDATE_USER",
        target_resource=f"user:{user_id}",
    ))
    await db.flush()

    return _user_to_out(user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_network_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(User).where(
            and_(User.user_id == user_id, User.network_id == current_user.network_id)
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    if user.is_admin and await _is_sole_admin(db, user):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the only admin of the network",
        )

    await db.delete(user)
    await db.flush()

    db.add(AuditLog(
        user_id=current_user.user_id,
        action="DELETE_USER",
        target_resource=f"user:{user_id}",
    ))
    await db.flush()


async def _is_sole_admin(db: AsyncSession, user: User) -> bool:
    count = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.network_id == user.network_id, User.is_admin.is_(True))
    )
    return (count.scalar_one() or 0) <= 1
