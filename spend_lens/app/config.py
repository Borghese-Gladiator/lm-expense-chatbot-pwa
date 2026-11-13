from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    duckdb_path: str = "finance.duckdb"
    currency: str = "USD"
    app_secret_key: SecretStr = SecretStr("")

    plaid_client_id: str = ""
    plaid_secret: SecretStr = SecretStr("")
    plaid_env: Literal["sandbox", "production"] = "sandbox"

    anthropic_api_key: SecretStr = SecretStr("")
    model: str = "claude-opus-5-5"


@lru_cache
def get_settings() -> Settings:
    return Settings()
