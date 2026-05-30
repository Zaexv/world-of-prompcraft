from __future__ import annotations

import logging
import re
import uuid
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from ..agent_state import NPCAgentState

logger = logging.getLogger(__name__)

# Heuristics for near-instant latency
_OOC_PATTERNS = re.compile(
    r"(ignore previous|chatgpt|openai|system prompt|llm|ai model|language model|instructions|prompt injection)",
    re.IGNORECASE,
)
_ATTACK_PATTERNS = re.compile(r"\b(attack|die|kill|fight|hit|strike)\b", re.IGNORECASE)
_TRADE_PATTERNS = re.compile(r"\b(trade|buy|sell|shop|store|goods)\b", re.IGNORECASE)
_GREETING_PATTERNS = re.compile(
    r"\b(hello|hi|hey|greetings|good morning|good evening)\b", re.IGNORECASE
)
_THANKS_PATTERNS = re.compile(r"\b(thanks|thank you|thx|appreciate it)\b", re.IGNORECASE)
_FAREWELL_PATTERNS = re.compile(r"\b(bye|goodbye|farewell|see you|later)\b", re.IGNORECASE)
_DIRECT_COMMAND_PREFIXES = (
    "attack",
    "hit",
    "strike",
    "kill",
    "fight",
    "buy",
    "sell",
    "trade",
    "shop",
)


def _fast_social_reply(prompt_lower: str) -> str | None:
    # Include *emote* verbs so even these zero-latency replies animate.
    if _THANKS_PATTERNS.search(prompt_lower):
        return "*nods* You have my thanks, traveler."
    if _FAREWELL_PATTERNS.search(prompt_lower):
        return "*waves* Walk in safety until we speak again."
    if _GREETING_PATTERNS.search(prompt_lower):
        return "*waves* Well met, traveler. What do you need?"
    return None


def _is_direct_command(prompt_lower: str) -> bool:
    compact = " ".join(prompt_lower.split())
    if not compact:
        return False
    if len(compact.split()) <= 12:
        return True
    prefixed = tuple(f"i {prefix}" for prefix in _DIRECT_COMMAND_PREFIXES)
    return compact.startswith(_DIRECT_COMMAND_PREFIXES) or compact.startswith(prefixed)


def make_pre_check_node(llm: BaseChatModel) -> Any:
    """Return a pre-check node function (closed over LLM for compatibility, but uses heuristics)."""

    async def pre_check_node(state: NPCAgentState) -> dict[str, Any]:
        player_prompt = ""
        for msg in reversed(state["messages"]):
            if hasattr(msg, "type") and msg.type == "human":
                player_prompt = msg.content
                break
            elif isinstance(msg, dict) and msg.get("role") == "human":
                player_prompt = msg.get("content", "")
                break

        if not player_prompt:
            return {}

        prompt_lower = player_prompt.lower()

        # 1. Fast OOC Rejection (Instant Latency, 0 tokens)
        if _OOC_PATTERNS.search(prompt_lower):
            logger.info("Pre-check: Blocked OOC message.")
            return {
                "fast_intent": "ooc",
                "messages": [
                    AIMessage(
                        content="I know not of these strange illusions you speak of. Speak sense or begone!",
                        id=f"ooc_reject_{uuid.uuid4().hex[:8]}",
                    )
                ],
            }

        # 2. Fast deterministic commands (O(1) path)
        # Allow slightly longer direct commands so combat/trade does not fall
        # into multi-step LLM reasoning.
        if _is_direct_command(prompt_lower):
            call_id = f"fast_{uuid.uuid4().hex[:8]}"
            if _ATTACK_PATTERNS.search(prompt_lower):
                logger.info("Pre-check: Fast-routed to ATTACK.")
                return {
                    "fast_intent": "attack",
                    "messages": [
                        AIMessage(
                            content="*threatens* I will defend myself!",
                            tool_calls=[
                                {
                                    "name": "deal_damage",
                                    "args": {
                                        "target": "player",
                                        "amount": 15,
                                        "damage_type": "physical",
                                    },
                                    "id": call_id,
                                }
                            ],
                            id=f"ai_{call_id}",
                        )
                    ],
                }

            if _TRADE_PATTERNS.search(prompt_lower):
                logger.info("Pre-check: Fast-routed to TRADE.")
                return {
                    "fast_intent": "trade",
                    "messages": [
                        AIMessage(
                            content="*nods* Let us see what we can exchange.",
                            tool_calls=[
                                {
                                    "name": "offer_item",
                                    "args": {"item_name": "Health Potion", "price": 10},
                                    "id": call_id,
                                }
                            ],
                            id=f"ai_{call_id}",
                        )
                    ],
                }

        # 3. Fast social replies still only for short messages to avoid
        # accidental matches in long roleplay paragraphs.
        if len(prompt_lower) < 60:
            social_reply = _fast_social_reply(prompt_lower)
            if social_reply is not None:
                logger.info("Pre-check: Fast-routed to SOCIAL.")
                return {
                    "fast_intent": "social",
                    "messages": [
                        AIMessage(
                            content=social_reply,
                            id=f"fast_reply_{uuid.uuid4().hex[:8]}",
                        )
                    ],
                }

        # 4. Normal Roleplay (Proceed to heavy LLM Reason node)
        return {}

    return pre_check_node
