"""Unit tests for application settings / config loading."""

import os
from functools import lru_cache

import pytest


def _make_settings(**overrides):
    """
    Instantiate Settings directly (bypassing the lru_cache) with the given
    environment variable overrides set in the process environment.

    Temporarily disables .env file loading so that only the explicit overrides
    (and existing env vars) are visible to the Settings constructor.
    """
    from app.core.config import Settings

    old = {}
    for key, value in overrides.items():
        old[key] = os.environ.get(key)
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = str(value)
    try:
        # Build a throwaway subclass that ignores .env files so tests are
        # isolated from whatever happens to exist on disk.
        class IsolatedSettings(Settings):
            model_config = Settings.model_config.copy()

        IsolatedSettings.model_config["env_file"] = ()

        return IsolatedSettings()
    finally:
        for key, value in old.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_testing_env_skips_db_validation():
    """ENV=testing should not require DATABASE_URL."""
    settings = _make_settings(ENV="testing", DATABASE_URL=None)
    assert settings.ENV == "testing"


def test_development_env_requires_database_url():
    """Missing DATABASE_URL in development mode raises ValueError."""
    with pytest.raises(ValueError, match="DATABASE_URL"):
        _make_settings(
            ENV="development",
            DATABASE_URL=None,
            USE_CLOUD_SQL_CONNECTOR="false",
        )


def test_cloud_sql_env_requires_connector_fields():
    """USE_CLOUD_SQL_CONNECTOR=true without connector fields raises ValueError."""
    with pytest.raises(ValueError, match="Missing Cloud SQL fields"):
        _make_settings(
            ENV="development",
            USE_CLOUD_SQL_CONNECTOR="true",
            CLOUD_SQL_INSTANCE_CONNECTION_NAME="",
            PGUSER="",
            PGPASSWORD="",
            PGDATABASE="",
        )


def test_is_production_property():
    """ENV=production → is_production is True."""
    settings = _make_settings(
        ENV="production",
        USE_CLOUD_SQL_CONNECTOR="true",
        CLOUD_SQL_INSTANCE_CONNECTION_NAME="proj:region:db",
        PGUSER="user",
        PGPASSWORD="pass",
        PGDATABASE="dermatlas",
    )
    assert settings.is_production is True
    assert settings.is_testing is False


def test_is_testing_property():
    """ENV=testing → is_testing is True."""
    settings = _make_settings(ENV="testing")
    assert settings.is_testing is True
    assert settings.is_production is False


def test_settings_cached():
    """get_settings() returns the same object on repeated calls (lru_cache)."""
    from app.core.config import get_settings

    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2
