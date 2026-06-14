"""Tests for quest actions flowing through WorldState.apply_actions."""

from __future__ import annotations

import pytest

from src.world.quests import instantiate
from src.world.world_state import WorldState


@pytest.fixture(autouse=True)
def _reset_world_state() -> None:
    WorldState._instance = None


@pytest.mark.asyncio
async def test_accept_quest_action_adds_full_instance() -> None:
    ws = WorldState()
    inst = instantiate("crystal_tear", "Elyria")
    assert inst is not None
    await ws.apply_actions(
        [
            {
                "kind": "accept_quest",
                "params": {"player_id": "alice", "quest": inst.to_storage_dict()},
            }
        ]
    )
    player = ws.get_player("alice")
    assert player.has_active_quest("crystal_tear")


@pytest.mark.asyncio
async def test_legacy_start_quest_by_id_still_works() -> None:
    ws = WorldState()
    await ws.apply_actions(
        [{"kind": "start_quest", "params": {"player_id": "bob", "quest_id": "village_patrol"}}]
    )
    assert ws.get_player("bob").has_active_quest("village_patrol")


@pytest.mark.asyncio
async def test_advance_objective_action_auto_completes_and_pays() -> None:
    ws = WorldState()
    player = ws.get_player("carol")
    player.accept_template("crystal_tear")
    # Force the first two objectives complete; advancing the last finishes it.
    quest = player.get_quest("crystal_tear")
    assert quest is not None
    quest["objectives"][0]["completed"] = True
    quest["objectives"][1]["completed"] = True
    await ws.apply_actions(
        [
            {
                "kind": "advance_objective",
                "params": {
                    "player_id": "carol",
                    "quest_id": "crystal_tear",
                    "objective_id": "return_elyria",
                },
            }
        ]
    )
    assert player.has_completed_quest("crystal_tear")
    assert "Amulet of Clarity" in player.inventory
    assert player.gold > 0


@pytest.mark.asyncio
async def test_complete_quest_action_grants_reward() -> None:
    ws = WorldState()
    player = ws.get_player("dave")
    player.accept_template("village_patrol")
    await ws.apply_actions(
        [{"kind": "complete_quest", "params": {"player_id": "dave", "quest_id": "village_patrol"}}]
    )
    assert player.has_completed_quest("village_patrol")
    assert "Guard's Badge of Honor" in player.inventory


@pytest.mark.asyncio
async def test_complete_quest_action_surfaces_reward_feedback() -> None:
    """Reward feedback (give_item/give_gold) must be appended to the actions list
    so the client renders banners — regression for quests "returning nothing"."""
    ws = WorldState()
    player = ws.get_player("erin")
    player.accept_template("village_patrol")
    actions = [
        {"kind": "complete_quest", "params": {"player_id": "erin", "quest_id": "village_patrol"}}
    ]
    await ws.apply_actions(actions)

    kinds = [a["kind"] for a in actions]
    # The originating complete_quest stays; reward feedback is appended.
    assert "give_item" in kinds
    assert any(
        a["kind"] == "give_item" and a["params"]["item"] == "Guard's Badge of Honor"
        for a in actions
    )
    # No duplicate complete_quest banner (the original already carries it).
    assert kinds.count("complete_quest") == 1


@pytest.mark.asyncio
async def test_advance_objective_completion_surfaces_reward_feedback() -> None:
    """Finishing a quest via advance_objective appends a complete_quest banner plus
    reward feedback to the actions list."""
    ws = WorldState()
    player = ws.get_player("frank")
    player.accept_template("crystal_tear")
    quest = player.get_quest("crystal_tear")
    assert quest is not None
    quest["objectives"][0]["completed"] = True
    quest["objectives"][1]["completed"] = True
    actions = [
        {
            "kind": "advance_objective",
            "params": {
                "player_id": "frank",
                "quest_id": "crystal_tear",
                "objective_id": "return_elyria",
            },
        }
    ]
    await ws.apply_actions(actions)

    kinds = [a["kind"] for a in actions]
    assert "complete_quest" in kinds
    assert any(
        a["kind"] == "give_item" and a["params"]["item"] == "Amulet of Clarity" for a in actions
    )
