"""
Application configuration using Pydantic Settings.

Based on:
- https://docs.pydantic.dev/latest/concepts/pydantic_settings/
- https://github.com/zhanymkanov/fastapi-best-practices
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    APP_NAME: str = "DermAtlas API"
    DEBUG: bool = False

    # Google Cloud Platform
    GCP_PROJECT_ID: str = ""
    GCS_BUCKET_NAME: str = ""
    VERTEX_AI_INDEX_ENDPOINT: str = ""


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Using lru_cache ensures settings are only parsed once,
    avoiding re-reading environment variables on every request.
    """
    return Settings()
