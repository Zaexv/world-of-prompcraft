from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage

from ...llm.concurrency import ainvoke_with_semaphore
from ...rag.retriever import get_retriever
from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from ..domain import get_relationship_tier
from ..prompts import REASON_SYSTEM_PROMPT

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)


def _build_system_prompt(state: NPCAgentState, player_prompt: str = "") -> str:
    """Construct the system prompt from NPC personality and world context using a clean template."""
    world = state.get("world_context", {})
    player = state.get("player_state", {})

    # Gather world lore via RAG
    lore_text = "No relevant lore found."
    if player_prompt:
        try:
            lore_entries = get_retriever().retrieve(player_prompt, top_k=3)
            if lore_entries:
                lore_text = "\n".join(
                    f"[{entry['topic']}]: {entry['content']}" for entry in lore_entries
                )
        except Exception:
            logger.warning("RAG retrieval failed", exc_info=True)

    # Gather recent chat
    recent_chat = world.get("recent_chat", [])
    recent_chat_text = "No recent chat overheard."
    if recent_chat:
        recent_chat_text = "\n".join(
            f"[{msg.get('player', '?')}]: {msg.get('text', '')}" for msg in recent_chat
        )

    recent_events = world.get("recent_events", [])
    recent_events_text = "; ".join(recent_events[-5:]) if recent_events else "None."

    score = state.get("relationship_score", 0) or 0
    relationship_tier = get_relationship_tier(score)

    episodic_memories = state.get("episodic_memories", [])
    episodic_memories_text = (
        "\n".join(f"- {mem}" for mem in episodic_memories) if episodic_memories else "None."
    )

    return REASON_SYSTEM_PROMPT.format(
        npc_name=state.get("npc_name", "Unknown NPC"),
        npc_personality=state.get("npc_personality", "You are a helpful villager."),
        current_goal=state.get("current_goal", "Survive and go about your day."),
        zone=world.get("zone", "Unknown"),
        time_of_day=world.get("time_of_day", "day"),
        weather=world.get("weather", "clear"),
        nearby_entities=json.dumps(world.get("nearby_entities", [])),
        recent_events=recent_events_text,
        hp=player.get("hp", "?"),
        max_hp=player.get("max_hp", "?"),
        mana=player.get("mana", "?"),
        max_mana=player.get("max_mana", "?"),
        level=player.get("level", "?"),
        inventory=json.dumps(player.get("inventory", [])),
        conversation_summary=state.get("conversation_summary", "") or "None.",
        episodic_memories=episodic_memories_text,
        mood=state.get("mood", "neutral") or "neutral",
        relationship_score=score,
        relationship_tier=relationship_tier,
        recent_chat=recent_chat_text,
        lore_entries=lore_text,
    )


def make_reason_node(llm: BaseChatModel, tools: list[BaseTool]) -> Any:
    """Return a reason node function closed over the given LLM and tools."""
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    async def reason_node(state: NPCAgentState) -> dict[str, Any]:
        # Extract latest player message for RAG retrieval
        player_prompt = ""
        for msg in reversed(state["messages"]):
            if hasattr(msg, "type") and msg.type == "human":
                player_prompt = msg.content
                break
            elif isinstance(msg, dict) and msg.get("role") == "human":
                player_prompt = msg.get("content", "")
                break
        system_prompt = _build_system_prompt(state, player_prompt)

        # Token optimization: Only pass recent messages to the LLM.
        # We cannot blindly slice [-6:] because we might orphan a ToolMessage
        # (which requires a preceding AIMessage with tool_calls) or an AIMessage
        # with tool_calls (which requires a succeeding ToolMessage).
        # We must find a safe boundary, ideally starting with a HumanMessage.
        safe_messages: list[Any] = []
        target_count = 6
        messages_list = state.get("messages", [])

        # We walk backwards. We want to collect up to ~6 messages.
        for msg in reversed(messages_list):
            safe_messages.insert(0, msg)
            # If we have enough messages AND the current message is a HumanMessage,
            # this is a safe boundary to stop going backwards.
            msg_type = getattr(msg, "type", msg.get("role") if isinstance(msg, dict) else "")
            if len(safe_messages) >= target_count and msg_type == "human":
                break

        messages = [SystemMessage(content=system_prompt), *safe_messages]

        ai_message = await ainvoke_with_semaphore(llm_with_tools, messages)
        return {"messages": [ai_message]}

    return reason_node
