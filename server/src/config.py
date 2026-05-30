from __future__ import annotations

from typing import Literal

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
    response_max_tokens: int = 140
    max_concurrent_llm_calls: int = 50
    llm_request_timeout_seconds: float = 8.0
    openai_request_timeout_seconds: float = 35.0
    reflect_every_n_turns: int = 3
    reflect_every_n_human_turns: int = 5
    # Covers a single cold-start request plus the warm reason → act → respond
    # LLM calls the agent graph makes per interaction, without leaving the player
    # waiting too long for the fallback response if the model genuinely stalls.
    agent_invoke_timeout_seconds: float = 60.0
    summarize_threshold_turns: int = 12
    summarize_every_n_turns: int = 6
    npc_sync_interval_seconds: float = 0.75
    npc_join_snapshot_radius: float = 140.0
    npc_world_update_radius: float = 140.0
    npc_snapshot_max_count: int = 12
    sqlite_game_db_path: str = "data/game_state.db"
    state_flush_interval_seconds: float = 5.0
    ws_port: int = 8000

    model_config = {
        "env_file": ["../.env", ".env"],
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
