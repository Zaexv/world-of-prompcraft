from __future__ import annotations

import os
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: Literal["claude", "openai", "ollama"] = "ollama"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o-mini"
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen3.5:9b"
    # Local models must be loaded into memory on the first request (cold start),
    # which can take tens of seconds for a multi-billion-parameter model. Keep the
    # per-request timeout generous and allow one retry so a cold-start timeout
    # recovers on the now-warm second attempt instead of failing the interaction.
    ollama_request_timeout_seconds: float = 60.0
    ollama_max_retries: int = 1
    # Many local models (e.g. Qwen3) are "thinking" models that emit a hidden
    # reasoning block before the answer. With our short response_max_tokens budget
    # they exhaust it on reasoning and return empty content, so the NPC says
    # nothing. "none" disables thinking for fast, in-character replies; set to
    # "low"/"medium"/"high" (or "" to omit the param) to re-enable it.
    ollama_reasoning_effort: str = "none"
    llm_temperature: float = 0.1
    max_tokens: int = 4096
    response_max_tokens: int = 180
    openai_request_timeout_seconds: float = 35.0
    max_concurrent_llm_calls: int = 24
    reflect_every_n_human_turns: int = 5
    # Covers a single cold-start request plus the warm reason → act → respond
    # LLM calls the agent graph makes per interaction, without leaving the player
    # waiting too long for the fallback response if the model genuinely stalls.
    agent_invoke_timeout_seconds: float = 60.0
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
