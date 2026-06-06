"""Quest tools for NPC agents.

Quests are server-authoritative instances. An NPC offers a quest two ways, both
producing the same instance shape that mutates the player's state:

* :func:`offer_quest` — a curated template from :data:`QUEST_TEMPLATES`.
* :func:`offer_custom_quest` — an improvised quest the NPC invents on the spot,
  validated and clamped by :func:`clamp_proposal` so it stays fulfillable and
  the reward stays in bounds.

Both emit an ``accept_quest`` action carrying the full instance; ``apply_actions``
adds it to the player. Completion is server-driven (objective progress) or, for
"report back" objectives, via :func:`complete_quest`.
"""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from ...world.quests import instantiate, template_ids
from ..quests.generator import QuestObjectiveProposal, QuestProposal, clamp_proposal


def create_quest_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    """Create quest-related tools closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player snapshot.

    Returns:
        A list of LangChain tool objects.
    """

    def _player_id() -> str:
        return str(world_state.get("player_id", ""))

    def _giver() -> tuple[str, str]:
        npc_id = str(world_state.get("self_npc_id", ""))
        npcs = world_state.get("npcs", {})
        name = npcs.get(npc_id, {}).get("name", npc_id) if isinstance(npcs, dict) else npc_id
        return npc_id, name

    def _player_level() -> int:
        return int(world_state.get("player", {}).get("level", 1) or 1)

    @tool
    def offer_quest(quest_id: str) -> str:
        """Offer a predefined quest to the player. Use when the player asks for
        adventures, work, or tasks and a curated quest fits.

        Args:
            quest_id: The curated quest template identifier to offer.
        """
        _, giver_name = _giver()
        instance = instantiate(quest_id, giver_name)
        if instance is None:
            return f"Unknown quest '{quest_id}'. Available: {', '.join(template_ids())}."
        pending_actions.append(
            {
                "kind": "accept_quest",
                "params": {"player_id": _player_id(), "quest": instance.to_storage_dict()},
            }
        )
        return f"Offered quest: {instance.title}"

    @tool
    def offer_custom_quest(
        title: str,
        description: str,
        objective_kind: str,
        objective_target: str,
        objective_description: str,
        required: int = 1,
        reward_gold: int = 0,
        reward_item: str = "",
        reward_xp: int = 0,
    ) -> str:
        """Invent and offer an improvised quest grounded in the current situation.
        Use for spontaneous, NPC-created quests not in the predefined list.

        objective_kind must be one of: kill, collect, talk, reach, enter_dungeon.
        objective_target is the enemy archetype/'any', item name, npc id, zone, or
        dungeon id depending on the kind. Rewards are clamped by the server.

        Args:
            title: Short quest title.
            description: One or two sentences of context.
            objective_kind: kill | collect | talk | reach | enter_dungeon.
            objective_target: What to act on (see above).
            objective_description: Player-facing objective text.
            required: How many (e.g. kill count). Defaults to 1.
            reward_gold: Gold reward (clamped by player level).
            reward_item: Optional item reward name.
            reward_xp: XP reward (clamped by player level).
        """
        giver_id, giver_name = _giver()
        proposal = QuestProposal(
            title=title,
            description=description,
            objectives=[
                QuestObjectiveProposal(
                    kind=objective_kind,
                    target=objective_target,
                    description=objective_description,
                    required=required,
                )
            ],
            reward_gold=reward_gold,
            reward_items=[reward_item] if reward_item else [],
            reward_xp=reward_xp,
        )
        instance = clamp_proposal(proposal, giver_id, giver_name, _player_level())
        pending_actions.append(
            {
                "kind": "accept_quest",
                "params": {"player_id": _player_id(), "quest": instance.to_storage_dict()},
            }
        )
        return f"Offered improvised quest: {instance.title}"

    @tool
    def advance_quest_objective(quest_id: str, objective_id: str) -> str:
        """Mark a quest objective as completed. Use when the player has fulfilled
        a requirement that only you can confirm (returned with an item, reported
        back, etc.). Kill/collect/dungeon objectives advance automatically.

        Args:
            quest_id: The quest identifier.
            objective_id: The specific objective to advance.
        """
        pending_actions.append(
            {
                "kind": "advance_objective",
                "params": {
                    "player_id": _player_id(),
                    "quest_id": quest_id,
                    "objective_id": objective_id,
                },
            }
        )
        return f"Advanced objective {objective_id} in quest {quest_id}"

    @tool
    def complete_quest(quest_id: str) -> str:
        """Complete a quest and pay the player its reward. Use when every objective
        is fulfilled. The reward (gold + items) is resolved from the quest itself.

        Args:
            quest_id: The identifier of the quest being completed.
        """
        pending_actions.append(
            {
                "kind": "complete_quest",
                "params": {"player_id": _player_id(), "quest_id": quest_id},
            }
        )
        return f"Completed quest {quest_id}"

    @tool
    def check_player_quests() -> str:
        """Check which quests the player currently has active and completed. Use
        this to decide whether to offer a new quest or complete an existing one."""
        player = world_state.get("player", {})
        active = player.get("active_quests", player.get("activeQuests", []))
        completed = player.get("completed_quests", player.get("completedQuests", []))
        inventory = player.get("inventory", [])
        return (
            f"Active quests: {active}\nCompleted quests: {completed}\nPlayer inventory: {inventory}"
        )

    # Expose the curated IDs dynamically so the prompt never hardcodes them.
    offer_quest.description += f" Available quest IDs: {', '.join(template_ids())}."

    return [
        offer_quest,
        offer_custom_quest,
        advance_quest_objective,
        complete_quest,
        check_player_quests,
    ]
