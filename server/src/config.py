from __future__ import annotations

import os
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_provider: Literal["claude", "openai", "ollama"] = "ollama"

    # ── Anthropic / Claude ────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    # OpenAI-compatible endpoint exposed by Anthropic (same interface as Ollama)
    anthropic_base_url: str = "https://api.anthropic.com/v1"
    anthropic_request_timeout_seconds: float = 35.0
    anthropic_max_retries: int = 2
    # Set to "low"/"medium"/"high" to enable extended thinking; empty = disabled
    anthropic_reasoning_effort: str = ""

    # ── OpenAI ────────────────────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_api_base: str = "https://api.openai.com/v1"
    openai_request_timeout_seconds: float = 35.0
    openai_max_retries: int = 2
    # Set to "low"/"medium"/"high" to enable reasoning (o-series models); empty = disabled
    openai_reasoning_effort: str = ""

    # ── Ollama (local, OpenAI-compatible) ─────────────────────────────────────
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
    # Keep the model loaded between requests. Ollama's default unloads after
    # ~5 min idle; the next request then pays a multi-GB cold reload that can
    # blow the agent timeout and surface as "the NPC/World Spirit does nothing".
    ollama_keep_alive: str = "60m"

    # ── Shared ────────────────────────────────────────────────────────────────
    llm_temperature: float = 0.1
    max_tokens: int = 4096
    response_max_tokens: int = 512
    # The world builder emits large create_custom_mesh tool calls (JSON with many
    # parts). Under the standard dialogue budget those truncate mid-JSON, the
    # serving layer drops the partial call, and the agent appears to do nothing.
    world_builder_max_tokens: int = 2048
    # Gate for the in-game NPC Designer (chat-driven NPC creation). Powerful edit —
    # disable in shared/production deployments where not every player should build NPCs.
    npc_designer_enabled: bool = True
    max_concurrent_llm_calls: int = 24
    reflect_every_n_human_turns: int = 5
    # Covers a single cold-start request plus the warm reason → act → respond
    # LLM calls the agent graph makes per interaction, without leaving the player
    # waiting too long for the fallback response if the model genuinely stalls.
    agent_invoke_timeout_seconds: float = 60.0
    ws_port: int = 8000

    # ── Persistence ───────────────────────────────────────────────────────────
    # SQLite database for the mutable game state (players, NPC hp/positions).
    # Empty string disables persistence (e.g. in tests).
    persistence_db_path: str = "data/world.db"
    persistence_save_interval_seconds: float = 30.0

    # World-wide directive injected into every NPC prompt (reasoning + speaking),
    # on top of each NPC's own personality. Use it for rules that must hold for
    # all characters. Override via the NPC_GLOBAL_DIRECTIVE env var; set empty to
    # disable. Default: mirror the player's language.
    npc_global_directive: str = (
        "Always reply in the SAME language the player used in their latest message "
        "(e.g. Spanish to Spanish, English to English). Never switch languages "
        "unless the player does. Stay fully in character while doing so."
    )

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
