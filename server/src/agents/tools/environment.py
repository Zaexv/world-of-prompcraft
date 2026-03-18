"""Environment and world-manipulation tools for NPC agents."""

from __future__ import annotations

from langchain_core.tools import tool

VALID_WEATHER = frozenset(["clear", "rain", "storm", "fog", "snow"])
VALID_EFFECTS = frozenset(
    ["explosion", "fire", "ice", "sparkle", "smoke", "lightning", "holy_light"]
)


def create_environment_tools(pending_actions: list, world_state: dict) -> list:
    """Create environment-related tools closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def change_weather(weather: str) -> str:
        """Change the current weather in the game world. Use for dramatic effect
        or as part of a story moment.

        Args:
            weather: The weather type to set. Must be one of:
                     "clear", "rain", "storm", "fog", "snow".
        """
        if weather not in VALID_WEATHER:
            return f"Invalid weather '{weather}'. Choose from: {', '.join(sorted(VALID_WEATHER))}"
        pending_actions.append(
            {
                "kind": "change_weather",
                "params": {"weather": weather},
            }
        )
        return f"Changed weather to {weather}"

    @tool
    def spawn_effect(effect_type: str, duration: float = 3.0) -> str:
        """Spawn a visual particle effect at the NPC's location. Use to add
        dramatic flair to actions, spells, or events.

        Args:
            effect_type: The effect to spawn. Must be one of:
                         "explosion", "fire", "ice", "sparkle", "smoke",
                         "lightning", "holy_light".
            duration: How long the effect lasts in seconds (default 3.0).
        """
        if effect_type not in VALID_EFFECTS:
            return (
                f"Invalid effect '{effect_type}'. Choose from: {', '.join(sorted(VALID_EFFECTS))}"
            )
        pending_actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": effect_type},
            }
        )
        return f"Spawned {effect_type} effect for {duration}s"

    @tool
    def move_npc(destination_x: float, destination_z: float) -> str:
        """Move this NPC to a specific position in the world. Use when the NPC
        needs to walk somewhere, patrol, or reposition.

        Args:
            destination_x: The target X coordinate.
            destination_z: The target Z coordinate.
        """
        pending_actions.append(
            {
                "kind": "move_npc",
                "params": {"position": [destination_x, 0, destination_z]},
            }
        )
        return f"Moving to position ({destination_x}, {destination_z})"

    return [change_weather, spawn_effect, move_npc]
