from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage
from pydantic import BaseModel, Field

from ...llm.concurrency import ainvoke_with_semaphore
from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from ..prompts import REFLECT_SYSTEM_PROMPT

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)


class ReflectionOutput(BaseModel):
    mood: str = Field(
        description="The current mood of the NPC (e.g., happy, angry, fearful, amused, annoyed, neutral). Max 1 word."
    )
    relationship_delta: int = Field(
        description="Change in relationship score from -20 to 20 based on the recent interaction. Positive for friendly/helpful actions, negative for insults/attacks."
    )
    new_episodic_memories: list[str] = Field(
        description="List of up to 2 distinct new memories to record about this interaction. Return an empty list if nothing notable occurred."
    )
    new_goal: str = Field(
        description="The new immediate goal or objective the NPC should pursue based on the interaction. Max 1 sentence."
    )


def _human_turn_count(messages: list[Any]) -> int:
    return sum(
        1
        for m in messages
        if (hasattr(m, "type") and m.type == "human")
        or (isinstance(m, dict) and m.get("role") == "human")
    )


def _should_run_llm_reflection(state: NPCAgentState) -> bool:
    # Always reflect when actions were taken; these are high-signal turns.
    if state.get("pending_actions"):
        return True

    every_n = 3
    try:
        from ...config import settings

        every_n = max(1, settings.reflect_every_n_turns)
    except Exception:
        every_n = 3

    human_turns = _human_turn_count(state.get("messages", []))
    if human_turns == 0:
        return False
    return human_turns % every_n == 0


def make_reflect_node(llm: BaseChatModel) -> Any:
    """Return a reflect node function closed over the given LLM."""

    # We bind the LLM to return structured output
    structured_llm = llm.with_structured_output(ReflectionOutput)

    async def reflect_node(state: NPCAgentState) -> dict[str, Any]:
        """Analyze the conversation to update mood, relationship, memories, and goals using an LLM."""
        fast_intent = (state.get("fast_intent") or "").lower()
        current_score = state.get("relationship_score", 0) or 0
        if fast_intent == "attack":
            return {
                "mood": "angry",
                "relationship_score": max(-100, current_score - 15),
                "current_goal": "Defend yourself and drive the attacker away.",
            }
        if fast_intent == "trade":
            return {
                "mood": state.get("mood", "neutral") or "neutral",
                "relationship_score": min(100, current_score + 3),
                "current_goal": "Complete the trade and keep business moving.",
            }
        if fast_intent == "ooc":
            return {
                "mood": "annoyed",
                "relationship_score": max(-100, current_score - 2),
                "current_goal": state.get("current_goal", "Stay in character."),
            }
        if fast_intent == "social":
            return {
                "mood": state.get("mood", "neutral") or "neutral",
                "relationship_score": min(100, current_score + 1),
                "current_goal": state.get("current_goal", "Greet travelers and remain watchful."),
            }

        if not _should_run_llm_reflection(state):
            return {}

        # Collect recent human and AI messages for context
        lines = []
        for msg in state["messages"][-6:]:
            if hasattr(msg, "type"):
                speaker = "Player" if msg.type == "human" else state.get("npc_name", "NPC")
                lines.append(f"{speaker}: {getattr(msg, 'content', '')}")
            elif isinstance(msg, dict):
                speaker = "Player" if msg.get("role") == "human" else state.get("npc_name", "NPC")
                lines.append(f"{speaker}: {msg.get('content', '')}")

        conversation_text = "\n".join(lines) if lines else "(No recent speech)"

        # Format pending actions
        actions = state.get("pending_actions", [])
        action_text = str(actions) if actions else "(No recent actions)"

        current_mood = state.get("mood", "neutral") or "neutral"
        current_goal = (
            state.get("current_goal", "Survive and go about your day.")
            or "Survive and go about your day."
        )

        prompt = REFLECT_SYSTEM_PROMPT.format(
            npc_name=state.get("npc_name", "an NPC"),
            current_goal=current_goal,
            current_mood=current_mood,
            current_score=current_score,
            conversation=conversation_text,
            actions=action_text,
        )

        try:
            result: ReflectionOutput = await ainvoke_with_semaphore(  # type: ignore[assignment]
                structured_llm, [SystemMessage(content=prompt)]
            )

            new_score = max(-100, min(100, current_score + result.relationship_delta))

            # Append new episodic memories (max 5 to prevent unbounded growth without vector DB)
            existing_memories = state.get("episodic_memories", [])
            new_memories = existing_memories.copy()
            if result.new_episodic_memories:
                new_memories.extend(result.new_episodic_memories)
                # Keep only the last 5 episodic memories to bound state size
                new_memories = new_memories[-5:]

            return {
                "mood": result.mood.lower(),
                "relationship_score": new_score,
                "current_goal": result.new_goal,
                "episodic_memories": new_memories,
            }
        except Exception:
            logger.warning("Reflection node failed; keeping existing state", exc_info=True)
            return {}

    return reflect_node
