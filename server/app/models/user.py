"""User ORM model."""

from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    PCP = "PCP"
    PATIENT = "PATIENT"


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, native_enum=False), nullable=False)
    npi_number: Mapped[str | None] = mapped_column(String(10), nullable=True)
    network_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("networks.network_id"), nullable=False, index=True
    )
    # is_admin is only meaningful when role=PCP. Only one admin per network is
    # permitted; this is enforced at write sites (create/update), not at the DB
    # level (partial indexes aren't portable across MySQL/Postgres).
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
