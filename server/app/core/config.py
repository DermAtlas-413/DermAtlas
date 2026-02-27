"""
Application configuration using Pydantic Settings.

Loads environment-specific files in priority order:
  .env.{ENV}  (base defaults for this mode)
  .env        (local override, gitignored)
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_MODE = os.environ.get("ENV", "development")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(f".env.{_ENV_MODE}", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    APP_NAME: str = "DermAtlas API"
    ENV: Literal["development", "testing", "staging", "production"] = "development"
    DEBUG: bool = False

    # Direct connection (development / testing)
    DATABASE_URL: Optional[str] = None

    # Cloud SQL connector (staging / production)
    USE_CLOUD_SQL_CONNECTOR: bool = False
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: str = ""
    PGUSER: str = ""
    PGPASSWORD: str = ""
    PGDATABASE: str = ""

    # Auth (JWT)
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Google Cloud Platform
    GCP_PROJECT_ID: str = ""
    GCS_BUCKET_NAME: str = ""
    VERTEX_AI_INDEX_ENDPOINT: str = ""

    @model_validator(mode="after")
    def validate_database_config(self) -> "Settings":
        if self.ENV == "testing":
            return self  # test suite overrides engine via fixture
        if not self.USE_CLOUD_SQL_CONNECTOR:
            if not self.DATABASE_URL:
                raise ValueError(
                    "DATABASE_URL required when USE_CLOUD_SQL_CONNECTOR=false"
                )
        else:
            missing = [
                k
                for k, v in {
                    "CLOUD_SQL_INSTANCE_CONNECTION_NAME": self.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
                    "PGUSER": self.PGUSER,
                    "PGPASSWORD": self.PGPASSWORD,
                    "PGDATABASE": self.PGDATABASE,
                }.items()
                if not v
            ]
            if missing:
                raise ValueError(f"Missing Cloud SQL fields: {', '.join(missing)}")
        return self

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def is_testing(self) -> bool:
        return self.ENV == "testing"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance (parsed once at startup)."""
    return Settings()
