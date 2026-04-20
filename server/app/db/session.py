"""
Async SQLAlchemy engine and session factory.

Two engine strategies are supported:
  - Direct URL  (development / testing): create_async_engine(DATABASE_URL)
  - Cloud SQL connector (staging / production): async_creator= via Connector + asyncpg
"""

from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

# Module-level singletons initialised by init_db_engine()
engine: AsyncEngine | None = None
AsyncSessionLocal: async_sessionmaker[AsyncSession] | None = None


def _build_direct_engine(settings) -> AsyncEngine:
    return create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        pool_pre_ping=True,
    )


def _build_cloud_sql_engine(settings) -> AsyncEngine:
    from google.cloud.sql.connector import create_async_connector  # type: ignore[import]

    _connector: list = []  # mutable container so the closure can assign once

    async def getconn():
        if not _connector:
            _connector.append(await create_async_connector())
        return await _connector[0].connect_async(
            settings.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
            "asyncpg",
            user=settings.PGUSER,
            password=settings.PGPASSWORD,
            db=settings.PGDATABASE,
        )

    return create_async_engine(
        "postgresql+asyncpg://",
        async_creator=getconn,
        echo=settings.DEBUG,
        pool_pre_ping=True,
    )


async def init_db_engine() -> None:
    """Create the engine and session factory. Called once at application startup."""
    global engine, AsyncSessionLocal

    settings = get_settings()
    if settings.USE_CLOUD_SQL_CONNECTOR:
        engine = _build_cloud_sql_engine(settings)
    else:
        engine = _build_direct_engine(settings)

    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
    )


async def close_db_engine() -> None:
    """Dispose the engine connection pool. Called at application shutdown."""
    global engine
    if engine is not None:
        await engine.dispose()
        engine = None


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session per request."""
    if AsyncSessionLocal is None:
        raise RuntimeError("Database engine not initialised. Call init_db_engine() first.")
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
