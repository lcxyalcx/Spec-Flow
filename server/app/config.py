from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000

    # OpenAI-compatible upstream (comma-separated for failover)
    upstream_urls: str = Field(
        default="https://api.openai.com/v1",
        description="Comma-separated base URLs, same path /chat/completions appended",
    )
    upstream_api_keys: str = Field(
        default="",
        description="Comma-separated keys aligned by index with upstream_urls, or single key for all",
    )
    default_target_model: str = "gpt-4o-mini"
    default_draft_model: str = "gpt-4o-mini"

    # Rough USD per 1M tokens for dashboard estimates (override via env)
    price_target_input_per_mtok: float = 2.5
    price_target_output_per_mtok: float = 10.0
    price_draft_input_per_mtok: float = 0.15
    price_draft_output_per_mtok: float = 0.6

    semantic_cache_max_entries: int = 5000
    semantic_similarity_threshold: float = 0.92
    embedding_model: str = "text-embedding-3-small"

    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


InferenceMode = Literal["standard", "speculative"]
