from __future__ import annotations

from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: Literal["claude", "openai"] = "openai"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.1
    max_tokens: int = 4096
    ws_port: int = 8000

    model_config = {"env_file": ["../.env", ".env"], "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def _require_api_key(self) -> Settings:
        if self.llm_provider == "claude" and not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY must be set when llm_provider='claude'")
        if self.llm_provider == "openai" and not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set when llm_provider='openai'")
        return self


settings = Settings()
