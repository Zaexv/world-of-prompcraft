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
    llm_temperature: float = 0.1
    max_tokens: int = 4096
    response_max_tokens: int = 140
    max_concurrent_llm_calls: int = 50
    llm_request_timeout_seconds: float = 8.0
    openai_request_timeout_seconds: float = 35.0
    reflect_every_n_turns: int = 3
    reflect_every_n_human_turns: int = 5
    agent_invoke_timeout_seconds: float = 45.0
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
