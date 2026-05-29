from __future__ import annotations

import os
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: Literal["claude", "openai", "ollama"] = "openai"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o-mini"
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen3.5:9b"
    llm_temperature: float = 0.1
    max_tokens: int = 4096
    response_max_tokens: int = 180
    openai_request_timeout_seconds: float = 35.0
    max_concurrent_llm_calls: int = 24
    reflect_every_n_human_turns: int = 5
    agent_invoke_timeout_seconds: float = 45.0
    ws_port: int = 8000

    model_config = {"env_file": ["../.env", ".env"], "env_file_encoding": "utf-8"}

    @model_validator(mode="after")
    def _require_api_key(self) -> Settings:
        is_testing = os.getenv("PYTEST_CURRENT_TEST") is not None or os.getenv("TESTING") == "1"

        if self.llm_provider == "claude" and not self.anthropic_api_key and not is_testing:
            raise ValueError("ANTHROPIC_API_KEY must be set when llm_provider='claude'")
        if self.llm_provider == "openai" and not self.openai_api_key and not is_testing:
            raise ValueError("OPENAI_API_KEY must be set when llm_provider='openai'")
        return self


settings = Settings()
