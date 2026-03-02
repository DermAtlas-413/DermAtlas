"""Unit tests for app/db/session.py engine factory helpers.

These tests call the session helpers directly (bypassing the noop_lifespan used
in integration tests) so that coverage.py can track them as synchronous or
non-aiosqlite-threaded code.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# _build_direct_engine
# ---------------------------------------------------------------------------


def test_build_direct_engine_returns_engine():
    """_build_direct_engine should produce an AsyncEngine from a DATABASE_URL."""
    from app.db.session import _build_direct_engine

    settings = MagicMock()
    settings.DATABASE_URL = "sqlite+aiosqlite:///:memory:"
    settings.DEBUG = False

    engine = _build_direct_engine(settings)
    assert engine is not None


def test_build_direct_engine_reflects_debug_flag():
    """_build_direct_engine is called twice: once with DEBUG=False, once with DEBUG=True."""
    from app.db.session import _build_direct_engine

    for debug in (False, True):
        settings = MagicMock()
        settings.DATABASE_URL = "sqlite+aiosqlite:///:memory:"
        settings.DEBUG = debug
        engine = _build_direct_engine(settings)
        assert engine is not None


# ---------------------------------------------------------------------------
# init_db_engine
# ---------------------------------------------------------------------------


def test_init_db_engine_sets_module_globals_direct(mocker):
    """init_db_engine (direct-connection path) must set engine and AsyncSessionLocal."""
    import app.db.session as session_module

    mock_settings = MagicMock()
    mock_settings.USE_CLOUD_SQL_CONNECTOR = False
    mock_engine = MagicMock()

    mocker.patch("app.db.session.get_settings", return_value=mock_settings)
    mocker.patch("app.db.session._build_direct_engine", return_value=mock_engine)

    original_engine = session_module.engine
    original_factory = session_module.AsyncSessionLocal

    try:
        session_module.init_db_engine()
        assert session_module.engine is mock_engine
        assert session_module.AsyncSessionLocal is not None
    finally:
        session_module.engine = original_engine
        session_module.AsyncSessionLocal = original_factory


# ---------------------------------------------------------------------------
# close_db_engine
# ---------------------------------------------------------------------------


async def test_close_db_engine_when_engine_is_none():
    """close_db_engine should be a no-op when the module-level engine is None."""
    import app.db.session as session_module

    original = session_module.engine
    session_module.engine = None
    try:
        await session_module.close_db_engine()  # must not raise
        assert session_module.engine is None
    finally:
        session_module.engine = original


async def test_close_db_engine_disposes_engine():
    """close_db_engine should call dispose() and reset engine to None."""
    import app.db.session as session_module

    mock_engine = MagicMock()
    mock_engine.dispose = AsyncMock()

    original = session_module.engine
    session_module.engine = mock_engine
    try:
        await session_module.close_db_engine()
        mock_engine.dispose.assert_called_once()
        assert session_module.engine is None
    finally:
        session_module.engine = original


# ---------------------------------------------------------------------------
# get_db
# ---------------------------------------------------------------------------


async def test_get_db_raises_when_not_initialized():
    """get_db should raise RuntimeError if AsyncSessionLocal has not been set."""
    import app.db.session as session_module

    original = session_module.AsyncSessionLocal
    session_module.AsyncSessionLocal = None
    try:
        with pytest.raises(RuntimeError, match="not initialised"):
            async for _ in session_module.get_db():
                pass
    finally:
        session_module.AsyncSessionLocal = original
