"""Tools for the NPC Designer agent — create / edit NPCs from chat.

Closure pattern like the other tool factories: the tools append intent actions
(``npc_create`` / ``npc_update``) to a shared ``pending_actions`` list which the
handler applies (persist + register agent + broadcast). They do NOT mutate world
state directly.
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from ..personalities.archetypes import ARCHETYPES


def create_npc_designer_tools(pending_actions: list[Any]) -> list[Any]:
    """Create NPC-designer tools closed over the shared actions list."""

    @tool
    def list_archetypes() -> str:
        """List the available NPC archetypes and the tools each one may use.

        Call this before create_npc if unsure which archetype fits — the
        archetype decides what the NPC can DO (e.g. a healer cannot attack).
        """
        lines = [
            f"- {a.key}: tools={', '.join(a.allowed_tools)}" + (" (hostile)" if a.hostile else "")
            for a in ARCHETYPES.values()
        ]
        return "Available archetypes:\n" + "\n".join(lines)

    @tool
    def create_npc(
        name: str,
        archetype: str,
        flavor_prompt: str,
        hp: int = 0,
    ) -> str:
        """Create a new NPC in the world.

        Args:
            name: The NPC's display name.
            archetype: One of the known archetypes (call list_archetypes). This
                fixes which tools the NPC may use — pick one that matches the
                role (e.g. friendly_merchant, friendly_healer, hostile_monster).
            flavor_prompt: The character's personality / voice (NO tool rules —
                those come from the archetype automatically).
            hp: Optional starting HP; 0 means use the archetype default.
        """
        if archetype not in ARCHETYPES:
            return (
                f"Unknown archetype {archetype!r}. Call list_archetypes for valid "
                "options, then try again."
            )
        pending_actions.append(
            {
                "kind": "npc_create",
                "params": {
                    "name": name,
                    "archetype": archetype,
                    "flavor_prompt": flavor_prompt,
                    "hp": hp,
                },
            }
        )
        return f"Created NPC '{name}' ({archetype})."

    @tool
    def edit_npc(npc_id: str, field: str, value: str) -> str:
        """Edit an existing designer-created NPC.

        Args:
            npc_id: The id of the NPC to edit (must start with 'des_').
            field: One of 'name', 'archetype', 'flavor_prompt'.
            value: The new value. For 'archetype' it must be a known archetype.
        """
        if field not in ("name", "archetype", "flavor_prompt"):
            return f"Cannot edit field {field!r}. Allowed: name, archetype, flavor_prompt."
        if field == "archetype" and value not in ARCHETYPES:
            return f"Unknown archetype {value!r}."
        pending_actions.append(
            {
                "kind": "npc_update",
                "params": {"npc_id": npc_id, "field": field, "value": value},
            }
        )
        return f"Updated {npc_id}: {field} = {value}."

    return [list_archetypes, create_npc, edit_npc]
