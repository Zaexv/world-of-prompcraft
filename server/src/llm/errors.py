from __future__ import annotations


class LLMProviderUnavailableError(RuntimeError):
    """Raised when the configured LLM provider cannot be reached."""
