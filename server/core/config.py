from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "World of Promptcraft"
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost:5432/db"
    OPENAI_API_KEY: str = "sk-placeholder"

    # Caching
    CACHE_ENABLED: bool = True
    CACHE_TTL: int = 3600

    # Rate Limiting
    MAX_CONCURRENT_LLM_CALLS: int = 50

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
