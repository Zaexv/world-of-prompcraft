from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage

from ...rag.retriever import get_retriever
from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from .inline_tools import extract_inline_tool_calls

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)
_ACTION_INTENT_PATTERNS = re.compile(
    r"\b(attack|fight|hit|kill|trade|buy|sell|shop|quest|item|heal|use|equip|give|take)\b",
    re.IGNORECASE,
)
_MAX_REASON_HISTORY_MESSAGES = 8
_MAX_SHORT_SOCIAL_MESSAGES = 3


def _build_system_prompt(state: NPCAgentState, player_prompt: str = "") -> str:
    """Construct the system prompt from NPC personality and world context."""
    world = state.get("world_context", {})
    player = state.get("player_state", {})

    nearby_entities = world.get("nearby_entities", [])
    compact_nearby = nearby_entities[:8] if isinstance(nearby_entities, list) else []
    inventory = player.get("inventory", [])
    compact_inventory = inventory[:10] if isinstance(inventory, list) else []

    parts = [
        f"You are {state['npc_name']}, an NPC in the world of Promptcraft.",
        "",
        "## Your Personality",
        state.get("npc_personality", "You are a helpful villager."),
        "",
        "## Current World Context",
        f"- Zone: {world.get('zone', 'Unknown')}",
        f"- Time of day: {world.get('time_of_day', 'day')}",
        f"- Weather: {world.get('weather', 'clear')}",
        f"- Nearby entities: {json.dumps(compact_nearby)}",
    ]

    # Recent world events for situational awareness
    recent_events = world.get("recent_events", [])
    if recent_events:
        parts.append(f"- Recent events: {'; '.join(recent_events[-5:])}")

    parts.extend(
        [
            "",
            "## Player State",
            f"- HP: {player.get('hp', '?')}/{player.get('max_hp', '?')}",
            f"- Mana: {player.get('mana', '?')}/{player.get('max_mana', '?')}",
            f"- Level: {player.get('level', '?')}",
            f"- Inventory: {json.dumps(compact_inventory)}",
        ]
    )

    # ── Memory & Relationship (enrichment from reflect/summarize) ────────
    summary = state.get("conversation_summary", "")
    if summary:
        parts.append("")
        parts.append("## Your Memory of This Player")
        parts.append(f"From past conversations you recall: {summary}")

    mood = state.get("mood", "neutral") or "neutral"
    parts.append("")
    parts.append(f"## Your Current Mood: {mood}")
    parts.append("Let this mood subtly influence your tone and word choice.")

    score = state.get("relationship_score", 0) or 0
    if score <= -50:
        rel_tier = "ENEMY — This player is your sworn foe. Be hostile and guarded."
    elif score <= -10:
        rel_tier = "DISTRUSTFUL — You distrust this player. Be wary and curt."
    elif score <= 10:
        rel_tier = "STRANGER — You have no strong feelings. Be polite but reserved."
    elif score <= 50:
        rel_tier = "FRIEND — You like this player. Be warm and helpful."
    else:
        rel_tier = "TRUSTED ALLY — This player is your trusted companion. Share secrets, offer rare items and quests."
    parts.append(f"## Your Relationship with This Player ({score}): {rel_tier}")

    notes = state.get("personality_notes", "")
    if notes:
        parts.append("")
        parts.append(f"## Personal Notes: {notes}")

    # RAG: retrieve relevant lore based on the player's prompt. Resolve this
    # before writing the instructions so the length budget can adapt: a plain
    # reply stays terse, a lore-bearing reply earns more room.
    lore_entries: list[dict[str, Any]] = []
    if player_prompt:
        try:
            lore_entries = get_retriever().retrieve(player_prompt, top_k=3)
        except Exception:
            logger.warning("RAG retrieval failed", exc_info=True)
            lore_entries = []
    lore_used = bool(lore_entries)

    parts.extend(
        [
            "",
            "## Instructions",
            "Respond to the player's prompt. Use tools to take actions in the world.",
            "Be creative and stay in character.",
            _length_budget_instruction(lore_used),
            "Your mood, relationship, and memories should naturally colour your dialogue.",
        ]
    )

    # Include recent chat from other players so NPCs are aware of world conversations
    recent_chat = world.get("recent_chat", [])
    if recent_chat:
        parts.append("")
        parts.append("## Recent World Chat (you can reference or react to these)")
        for msg in recent_chat[-2:]:
            parts.append(f"  [{msg.get('player', '?')}]: {msg.get('text', '')}")

    if lore_used:
        parts.append("")
        parts.append("## World Lore (use to enrich your responses)")
        for entry in lore_entries:
            parts.append(f"[{entry['topic']}]: {entry['content']}")

    return "\n".join(parts)


def _length_budget_instruction(lore_used: bool) -> str:
    """Hard character budget for the spoken reply, tighter when there is no lore.

    Prompt-only enforcement: the dialogue is never truncated server-side, so the
    instruction must be explicit. Lore-bearing replies earn extra room to share it.
    """
    if lore_used:
        return (
            "LENGTH: Keep your reply under 500 characters since you are sharing lore. "
            "Stay tight — only the lore that answers the prompt, no rambling."
        )
    return (
        "LENGTH: Keep your reply under 200 characters. One or two punchy sentences. "
        "No exposition, no lists, no lore dumps."
    )


def _build_compact_system_prompt(state: NPCAgentState) -> str:
    world = state.get("world_context", {})
    return (
        f"You are {state.get('npc_name', 'an NPC')} in {world.get('zone', 'the area')} in a fantasy RPG world. "
        f"Personality: {state.get('npc_personality', 'helpful villager')}. "
        f"Mood: {state.get('mood', 'neutral')}. "
        "Reply naturally in character, but keep it under 200 characters — one short "
        "sentence is plenty. Do not mention being an AI."
    )


def _select_reasoning_messages(state: NPCAgentState, short_social: bool) -> list[Any]:
    """Keep the active prompt bounded while preserving the current exchange."""
    max_messages = _MAX_SHORT_SOCIAL_MESSAGES if short_social else _MAX_REASON_HISTORY_MESSAGES
    return state.get("messages", [])[-max_messages:]


def make_reason_node(
    llm: BaseChatModel, tools: list[BaseTool], shared_pending_actions: list[Any]
) -> Any:
    """Return a reason node function closed over the given LLM and tools."""
    llm_with_tools = llm.bind_tools(tools) if tools else llm
    tool_map = {t.name: t for t in tools}
    params_by_tool = {
        t.name: [(name, info.get("type", "string")) for name, info in t.args.items()] for t in tools
    }

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
        prompt_stripped = player_prompt.strip()
        short_social = len(prompt_stripped) <= 18 and not _ACTION_INTENT_PATTERNS.search(
            prompt_stripped
        )
        system_prompt = (
            _build_compact_system_prompt(state)
            if short_social
            else _build_system_prompt(state, player_prompt)
        )
        msg_tail = _select_reasoning_messages(state, short_social)
        messages = [SystemMessage(content=system_prompt), *msg_tail]
        active_llm = llm if short_social else llm_with_tools
        ai_message = await active_llm.ainvoke(messages)

        # Fallback: some local models emit tool calls as plain text in the
        # content instead of structured tool_calls (which the act node and
        # router rely on). Parse them, run the real tools so the actions fire,
        # and strip the call syntax from the dialogue the player sees.
        structured = getattr(ai_message, "tool_calls", None)
        content = getattr(ai_message, "content", "")
        if not structured and tool_map and isinstance(content, str):
            cleaned, parsed = extract_inline_tool_calls(content, params_by_tool)
            if parsed:
                shared_pending_actions.clear()
                for call in parsed:
                    tool = tool_map.get(call["name"])
                    if tool is None:
                        continue
                    try:
                        await tool.ainvoke(call["args"])
                    except Exception:
                        logger.warning("Inline tool call %s failed", call["name"], exc_info=True)
                harvested = list(shared_pending_actions)
                shared_pending_actions.clear()
                ai_message.content = cleaned or "..."
                return {
                    "messages": [ai_message],
                    "pending_actions": [*state.get("pending_actions", []), *harvested],
                }

        return {"messages": [ai_message]}

    return reason_node
