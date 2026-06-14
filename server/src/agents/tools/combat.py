"""Combat tools for NPC agents."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool


def create_offense_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    """Create offensive combat tools (deal_damage) closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def deal_damage(target: str, amount: int, damage_type: str = "physical") -> str:
        """Deal damage to a target entity. Use this during combat encounters.

        Args:
            target: The name or id of the target (e.g. "player" or an NPC id).
            amount: How many hit-points of damage to inflict.
            damage_type: The element or type of damage ("physical", "fire", "ice",
                         "lightning", "holy", "dark").
        """
        pending_actions.append(
            {
                "kind": "damage",
                "params": {
                    "target": target,
                    "player_id": world_state.get("player_id", ""),
                    "amount": amount,
                    "damageType": damage_type,
                },
            }
        )

        # Update world state when targeting the player
        if target == "player":
            player = world_state.get("player", {})
            current_hp = player.get("hp", 100)
            player["hp"] = max(0, current_hp - amount)
            world_state["player"] = player

        return f"Dealt {amount} {damage_type} damage to {target}"

    return [deal_damage]


def create_defense_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    """Create survival tools (defend, flee) closed over shared state.

    Shared by hostile archetypes AND support archetypes — a healer fleeing or
    bracing is valid.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def defend(stance: str = "block") -> str:
        """Assume a defensive stance to reduce incoming damage. Use when the NPC
        wants to protect itself rather than attack.

        Args:
            stance: The type of defensive stance ("block", "parry", "dodge", "brace").
        """
        pending_actions.append(
            {
                "kind": "emote",
                "params": {"animation": "defend"},
            }
        )
        return f"Assumed {stance} defensive stance, reducing incoming damage"

    @tool
    def flee(direction: str = "away") -> str:
        """Flee from combat by moving away quickly. Use when the NPC is outmatched
        or wants to disengage.

        Args:
            direction: The direction to flee ("away", "north", "south", "east", "west").
        """
        npc_pos = world_state.get("self_position", [0, 0, 0])
        direction_offsets: dict[str, tuple[float, float]] = {
            "north": (0.0, -20.0),
            "south": (0.0, 20.0),
            "east": (20.0, 0.0),
            "west": (-20.0, 0.0),
            "away": (0.0, 20.0),
        }
        dx, dz = direction_offsets.get(direction, (0.0, 20.0))
        target_pos = [float(npc_pos[0]) + dx, 0.0, float(npc_pos[2]) + dz]
        pending_actions.append(
            {
                "kind": "move_npc",
                "params": {"position": target_pos},
            }
        )
        return f"Fled {direction}"

    return [defend, flee]


def create_support_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    """Create support tools (heal_target) closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def heal_target(target: str, amount: int) -> str:
        """Heal a target, restoring hit-points. Use this when the NPC wants to
        restore health to the player or another entity.

        Args:
            target: The name or id of the target to heal (e.g. "player").
            amount: How many hit-points to restore (must be positive).
        """
        heal_amount = abs(amount)
        pending_actions.append(
            {
                "kind": "heal",
                "params": {
                    "target": target,
                    "amount": heal_amount,
                },
            }
        )

        if target == "player":
            player = world_state.get("player", {})
            current_hp = player.get("hp", 100)
            max_hp = player.get("maxHp", player.get("max_hp", 100))
            player["hp"] = min(max_hp, current_hp + heal_amount)
            world_state["player"] = player

        return f"Healed {target} for {heal_amount} HP"

    return [heal_target]


def create_combat_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    """Back-compat alias: all combat tools (offense + defense + support).

    Retained so existing imports (e.g. the WorldBuilder agent) keep working.
    New code should bind the narrower ``offense`` / ``support`` / ``defense``
    categories via the archetype tool limit.
    """
    return [
        *create_offense_tools(pending_actions, world_state),
        *create_defense_tools(pending_actions, world_state),
        *create_support_tools(pending_actions, world_state),
    ]
