"""World query tools for NPC agents to inspect the game state."""

from __future__ import annotations

import json

from langchain_core.tools import tool


def create_world_query_tools(pending_actions: list, world_state: dict) -> list:
    """Create world-query tools closed over shared state.

    Args:
        pending_actions: Mutable list (unused by queries, kept for interface consistency).
        world_state: Dict holding current world/player state to read from.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def get_nearby_entities(radius: float = 50.0) -> str:
        """Look around and discover nearby NPCs, creatures, and objects within a
        given radius. Use to gather situational awareness before acting.

        Args:
            radius: How far to scan in world units (default 50.0).
        """
        npcs = world_state.get("npcs", {})
        self_id = world_state.get("self_npc_id", "")
        self_pos = world_state.get("self_position", [0, 0, 0])

        nearby: list[str] = []
        for npc_id, npc in npcs.items():
            if npc_id == self_id:
                continue
            pos = npc.get("position", [0, 0, 0])
            dx = pos[0] - self_pos[0]
            dz = pos[2] - self_pos[2]
            dist = (dx * dx + dz * dz) ** 0.5
            if dist <= radius:
                hp = npc.get("hp", "?")
                name = npc.get("name", npc_id)
                nearby.append(f"- {name} (id={npc_id}) at distance {dist:.0f}, HP={hp}")

        # Include player info if available and within radius
        player = world_state.get("player", {})
        player_pos = player.get("position", [0, 0, 0])
        dx = player_pos[0] - self_pos[0]
        dz = player_pos[2] - self_pos[2]
        player_dist = (dx * dx + dz * dz) ** 0.5
        if player_dist <= radius:
            nearby.append(
                f"- Player at distance {player_dist:.0f}, HP={player.get('hp', '?')}"
            )

        if not nearby:
            return f"No entities found within {radius} units."
        return f"Nearby entities (within {radius} units):\n" + "\n".join(nearby)

    @tool
    def check_player_state() -> str:
        """Check the player's current status including health, inventory, and
        position. Use to decide how to interact with the player.
        """
        player = world_state.get("player", {})
        hp = player.get("hp", "unknown")
        inventory = player.get("inventory", [])
        position = player.get("position", [0, 0, 0])

        inv_str = ", ".join(inventory) if inventory else "empty"
        return (
            f"Player state - HP: {hp}, "
            f"Inventory: [{inv_str}], "
            f"Position: ({position[0]}, {position[1]}, {position[2]})"
        )

    return [get_nearby_entities, check_player_state]
