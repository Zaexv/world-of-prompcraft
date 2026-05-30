from __future__ import annotations

from typing import Annotated, Any, NotRequired, TypedDict

from langgraph.graph.message import add_messages


class NPCAgentState(TypedDict):
    messages: Annotated[list[Any], add_messages]  # Conversation history
    npc_id: str
    npc_name: str
    npc_personality: str
    player_state: dict[str, Any]  # HP, inventory, position
    world_context: dict[str, Any]  # Nearby entities, time of day, zone
    pending_actions: list[dict[str, Any]]  # Actions to execute in the world
    response_text: str  # Final dialogue to send back

    # --- Advanced Memory & Autonomy ---
    # Memory: rolling summary of past conversations with this player
    conversation_summary: str
    # Discrete list of key events or facts remembered about the player
    episodic_memories: list[str]

    # Emotional state: current mood of the NPC toward this player
    mood: str
    # Relationship: cumulative score from -100 (enemy) to 100 (trusted ally)
    relationship_score: int
    # Personality evolution: NPC-specific notes about this player
    personality_notes: str

    # Current objective the NPC is trying to achieve (updated via reflection)
    current_goal: str
    # Fast intent detected in pre-check (e.g. attack/trade/ooc)
    fast_intent: NotRequired[str]
    # Tool names executed in the most recent act node step.
    last_tool_names: NotRequired[list[str]]
