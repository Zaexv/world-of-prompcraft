"""Shared construction for procedurally-spawned NPCs.

Procedural creatures reach the world two ways — area exploration (``explore_area``)
and first contact in combat (``interaction``). Both build the same kind of NPC, so
the personality/archetype/HP resolution lives here once instead of being duplicated
(and drifting) across the two handlers.
"""

from __future__ import annotations

from .world_state import NPCData


def build_procedural_npc(
    npc_id: str,
    name: str,
    personality_key: str,
    position: list[float],
    *,
    behavior: str = "hostile",
    hp: int | None = None,
    fallback_prompt: str | None = None,
) -> NPCData:
    """Build a movable procedural NPC, resolving its real personality + archetype.

    Prefers the authored ``NPC_PERSONALITIES[personality_key]`` (so creatures keep
    their fierce/territorial character); otherwise uses ``fallback_prompt`` and a
    hostile-monster archetype. Always ``fixed=False`` so the wander loop roams it.
    """
    from ..agents.personalities.templates import NPC_PERSONALITIES

    template = NPC_PERSONALITIES.get(personality_key, {})
    default_fallback = (
        f"You are {name}, a creature encountered in the wild. You are hostile and territorial."
    )
    system_prompt = template.get("system_prompt") or fallback_prompt or default_fallback
    archetype = template.get("archetype", "hostile_monster" if behavior == "hostile" else "")
    resolved_hp = int(hp or (60 if behavior == "hostile" else 80))

    return NPCData(
        npc_id=npc_id,
        name=name,
        personality=system_prompt,
        hp=resolved_hp,
        max_hp=resolved_hp,
        position=list(position),
        archetype=archetype,
        fixed=False,
    )
