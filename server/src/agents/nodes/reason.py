from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage

from ...llm.concurrency import ainvoke_with_semaphore
from ...rag.retriever import get_retriever
from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from ..domain import get_relationship_tier
from ..prompts import REASON_SYSTEM_PROMPT
from .inline_tools import extract_inline_tool_calls

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

    from ..action_sink import PendingActionSink

logger = logging.getLogger(__name__)

_ACTION_INTENT_PATTERNS = re.compile(
    r"\b(attack|fight|hit|kill|trade|buy|sell|shop|quest|item|heal|use|equip|give|take)\b",
    re.IGNORECASE,
)


def _build_compact_system_prompt(state: NPCAgentState) -> str:
    """Build a minimal system prompt for short social interactions."""
    npc_name = state.get("npc_name", "Unknown NPC")
    npc_personality = state.get("npc_personality", "You are a helpful villager.")
    mood = state.get("mood", "neutral")
    
    return (
        f"You are {npc_name}. Personality: {npc_personality}. Current mood: {mood}.\n"
        "Reply naturally in 1-2 short sentences. Stay in character. No thinking block."
    )


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


def make_reason_node(
    llm: BaseChatModel, tools: list[BaseTool], pending_action_sink: PendingActionSink | None = None
) -> Any:
    """Return a reason node function closed over the given LLM and tools."""
    llm_with_tools = llm.bind_tools(tools) if tools else llm
    tool_map = {t.name: t for t in tools}
    params_by_tool = {
        t.name: [(name, info.get("type", "string")) for name, info in t.args.items()] for t in tools
    }

    async def reason_node(state: NPCAgentState) -> dict[str, Any]:
        # Extract latest player message for RAG retrieval and intent analysis
        player_prompt = ""
        for msg in reversed(state["messages"]):
            if hasattr(msg, "type") and msg.type == "human":
                player_prompt = msg.content
                break
            elif isinstance(msg, dict) and msg.get("role") == "human":
                player_prompt = msg.get("content", "")
                break

        prompt_stripped = player_prompt.strip()
        # Optimization: short greetings bypass heavy system prompts and tool binding
        short_social = len(prompt_stripped) <= 18 and not _ACTION_INTENT_PATTERNS.search(
            prompt_stripped
        )

        if short_social:
            system_prompt = _build_compact_system_prompt(state)
            messages = [SystemMessage(content=system_prompt), state["messages"][-1]]
            ai_message = await ainvoke_with_semaphore(llm, messages)
        else:
            system_prompt = _build_system_prompt(state, player_prompt)

            # Token optimization: Only pass recent messages to the LLM.
            safe_messages: list[Any] = []
            target_count = 6
            messages_list = state.get("messages", [])

            for msg in reversed(messages_list):
                safe_messages.insert(0, msg)
                msg_type = getattr(msg, "type", msg.get("role") if isinstance(msg, dict) else "")
                if len(safe_messages) >= target_count and msg_type == "human":
                    break

            messages = [SystemMessage(content=system_prompt), *safe_messages]
            ai_message = await ainvoke_with_semaphore(llm_with_tools, messages)

        # Fallback: some local models emit tool calls as plain text in the content
        structured = getattr(ai_message, "tool_calls", None)
        content = getattr(ai_message, "content", "")
        
        if not structured and tool_map and isinstance(content, str) and pending_action_sink:
            cleaned, parsed = extract_inline_tool_calls(content, params_by_tool)
            if parsed:
                import uuid
                capture_id = uuid.uuid4().hex
                capture_token = pending_action_sink.start_capture(capture_id)
                try:
                    for call in parsed:
                        tool = tool_map.get(call["name"])
                        if tool is not None:
                            try:
                                await tool.ainvoke(call["args"])
                            except Exception:
                                logger.warning("Inline tool call %s failed", call["name"], exc_info=True)
                finally:
                    pending_action_sink.end_capture(capture_token)
                
                harvested = pending_action_sink.drain(capture_id)
                ai_message.content = cleaned or "..."
                return {
                    "messages": [ai_message],
                    "pending_actions": [*state.get("pending_actions", []), *harvested],
                }

        return {"messages": [ai_message]}

    return reason_node
