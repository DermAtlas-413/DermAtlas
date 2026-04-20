"""
Seed test users into the database.

Usage (staging):
    cd server
    ENV=staging python scripts/seed_users.py

Usage (development):
    cd server
    ENV=development python scripts/seed_users.py
"""

import asyncio
import os
import sys

# Allow running from the server/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.auth import get_password_hash
from app.core.config import get_settings
from app.db.session import _build_cloud_sql_engine, _build_direct_engine
from app.models.user import User, UserRole

TEST_USERS = [
    {
        "email": "dr.smith@dermatlas.test",
        "password": "TestPass123!",
        "full_name": "Dr. Jane Smith",
        "role": UserRole.PCP,
        "npi_number": "1234567890",
    },
    {
        "email": "dr.jones@dermatlas.test",
        "password": "TestPass123!",
        "full_name": "Dr. Bob Jones",
        "role": UserRole.PCP,
        "npi_number": "0987654321",
    },
]


async def seed(session: AsyncSession) -> None:
    for data in TEST_USERS:
        existing = await session.execute(
            select(User).where(User.email == data["email"])
        )
        if existing.scalar_one_or_none():
            print(f"  SKIP  {data['email']} (already exists)")
            continue

        user = User(
            email=data["email"],
            password_hash=get_password_hash(data["password"]),
            full_name=data["full_name"],
            role=data["role"],
            npi_number=data.get("npi_number"),
        )
        session.add(user)
        print(f"  ADD   {data['email']} ({data['role'].value})")

    await session.commit()
    print("Done.")


async def main() -> None:
    settings = get_settings()
    print(f"ENV={settings.ENV}  Cloud SQL connector={settings.USE_CLOUD_SQL_CONNECTOR}")

    engine = (
        _build_cloud_sql_engine(settings)
        if settings.USE_CLOUD_SQL_CONNECTOR
        else _build_direct_engine(settings)
    )

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        await seed(session)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
