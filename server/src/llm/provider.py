from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from ..config import Settings


def get_llm(settings: Settings) -> BaseChatModel:
    """Factory that returns a chat model based on the configured provider."""
    if settings.llm_provider == "claude":
        return ChatAnthropic(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
        )
    if settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
            temperature=settings.llm_temperature,
            max_tokens=settings.max_tokens,
        )
    raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
