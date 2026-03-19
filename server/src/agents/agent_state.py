from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class NPCAgentState(TypedDict):
    messages: Annotated[list, add_messages]  # Conversation history
    npc_id: str
    npc_name: str
    npc_personality: str
    player_state: dict  # HP, inventory, position
    world_context: dict  # Nearby entities, time of day, zone
    pending_actions: list[dict]  # Actions to execute in the world
    response_text: str  # Final dialogue to send back
    # Memory: rolling summary of past conversations with this player
    conversation_summary: str
    # Emotional state: current mood of the NPC toward this player
    mood: str
    # Relationship: cumulative score from -100 (enemy) to 100 (trusted ally)
    relationship_score: int
    # Personality evolution: NPC-specific notes about this player
    personality_notes: str
