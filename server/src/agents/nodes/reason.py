from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage

from ...rag.retriever import get_retriever

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

    from ..agent_state import NPCAgentState


def _build_system_prompt(state: NPCAgentState, player_prompt: str = "") -> str:
    """Construct the system prompt from NPC personality and world context."""
    world = state.get("world_context", {})
    player = state.get("player_state", {})

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
        f"- Nearby entities: {json.dumps(world.get('nearby_entities', []))}",
    ]

    # Recent world events for situational awareness
    recent_events = world.get("recent_events", [])
    if recent_events:
        parts.append(f"- Recent events: {'; '.join(recent_events[-5:])}")

    parts.extend([
        "",
        "## Player State",
        f"- HP: {player.get('hp', '?')}/{player.get('max_hp', '?')}",
        f"- Mana: {player.get('mana', '?')}/{player.get('max_mana', '?')}",
        f"- Level: {player.get('level', '?')}",
        f"- Inventory: {json.dumps(player.get('inventory', []))}",
    ])

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

    parts.extend([
        "",
        "## Instructions",
        "Respond to the player's prompt. Use tools to take actions in the world.",
        "Be creative and stay in character. Keep your responses concise but flavourful.",
        "Your mood, relationship, and memories should naturally colour your dialogue.",
    ])

    # Include recent chat from other players so NPCs are aware of world conversations
    recent_chat = world.get("recent_chat", [])
    if recent_chat:
        parts.append("")
        parts.append("## Recent World Chat (you can reference or react to these)")
        for msg in recent_chat:
            parts.append(f"  [{msg.get('player', '?')}]: {msg.get('text', '')}")

    # RAG: retrieve relevant lore based on the player's prompt
    if player_prompt:
        retriever = get_retriever()
        lore_entries = retriever.retrieve(player_prompt, top_k=3)
        if lore_entries:
            parts.append("")
            parts.append("## World Lore (use to enrich your responses)")
            for entry in lore_entries:
                parts.append(f"[{entry['topic']}]: {entry['content']}")

    return "\n".join(parts)


def make_reason_node(llm: BaseChatModel, tools: list[BaseTool]) -> Any:
    """Return a reason node function closed over the given LLM and tools."""
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    async def reason_node(state: NPCAgentState) -> dict:
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
        messages = [SystemMessage(content=system_prompt), *state["messages"]]
        ai_message = await llm_with_tools.ainvoke(messages)
        return {"messages": [ai_message]}

    return reason_node
