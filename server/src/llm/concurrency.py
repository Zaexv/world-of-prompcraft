from __future__ import annotations

import asyncio
from typing import Any

from openai import APIConnectionError

from .errors import LLMProviderUnavailableError

_DEFAULT_MAX_CONCURRENT_LLM_CALLS = 50
_DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS = 8.0
_llm_semaphore: asyncio.Semaphore | None = None


def _get_llm_semaphore() -> asyncio.Semaphore:
    global _llm_semaphore
    if _llm_semaphore is not None:
        return _llm_semaphore

    max_concurrency = _DEFAULT_MAX_CONCURRENT_LLM_CALLS
    try:
        from ..config import settings

        max_concurrency = max(1, settings.max_concurrent_llm_calls)
    except Exception:
        max_concurrency = _DEFAULT_MAX_CONCURRENT_LLM_CALLS

    _llm_semaphore = asyncio.Semaphore(max_concurrency)
    return _llm_semaphore


def _get_llm_request_timeout_seconds() -> float:
    timeout = _DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS
    try:
        from ..config import settings

        timeout = max(0.0, settings.llm_request_timeout_seconds)
    except Exception:
        timeout = _DEFAULT_LLM_REQUEST_TIMEOUT_SECONDS
    return timeout


async def ainvoke_with_semaphore(runnable: Any, payload: Any) -> Any:
    """Run ainvoke behind a shared semaphore to smooth latency under load."""
    async with _get_llm_semaphore():
        try:
            timeout = _get_llm_request_timeout_seconds()
            if timeout <= 0:
                return await runnable.ainvoke(payload)
            return await asyncio.wait_for(runnable.ainvoke(payload), timeout=timeout)
        except TimeoutError as exc:
            raise LLMProviderUnavailableError("LLM request timed out") from exc
        except APIConnectionError as exc:
            raise LLMProviderUnavailableError("LLM provider is unavailable") from exc
