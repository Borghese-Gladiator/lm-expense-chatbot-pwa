"""Environment-driven application configuration."""

from __future__ import annotations

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    lunchmoney_token: SecretStr = SecretStr("")
    anthropic_api_key: SecretStr = SecretStr("")
    duckdb_path: str = "finance.duckdb"
    http_timeout_seconds: float = 30.0
    model: str = "claude-3-5-sonnet-latest"
    base_currency: str = "usd"

    max_rows: int = 10_000
    max_bytes: int = 5_000_000
    max_time_ms: int = 10_000
    inline_row_threshold: int = 100


@lru_cache
def get_settings() -> Settings:
    return Settings()
