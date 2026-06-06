"""Tests for the event-driven objective-matcher service."""

from __future__ import annotations

from src.world import quest_progress
from src.world.player_state import PlayerData
from src.world.quests import QuestInstance, QuestObjective, QuestReward


def _quest(*objectives: QuestObjective, reward: QuestReward | None = None) -> dict:
    inst = QuestInstance(
        id="q_test",
        title="Test Quest",
        description="d",
        giver_npc_id="npc_1",
        giver_name="NPC One",
        objectives=list(objectives),
        reward=reward or QuestReward(gold=25, items=["Trophy"], xp=10),
    )
    return inst.to_storage_dict()


def test_matcher_registry_covers_all_kinds() -> None:
    for kind in ("kill", "collect", "talk", "reach", "enter_dungeon"):
        assert kind in quest_progress.OBJECTIVE_MATCHERS


def test_kill_any_matches_any_enemy() -> None:
    p = PlayerData()
    p.active_quests.append(_quest(QuestObjective("o", "Kill 2", "kill", "any", required=2)))
    actions = quest_progress.on_event(p, {"type": "enemy_killed", "archetype": "dire_wolf"})
    obj = p.get_quest("q_test")["objectives"][0]  # type: ignore[index]
    assert obj["progress"] == 1
    assert obj["completed"] is False
    assert any(a["kind"] == "advance_objective" for a in actions)


def test_kill_specific_target_only_matches_it() -> None:
    p = PlayerData()
    p.active_quests.append(
        _quest(QuestObjective("o", "Kill wolves", "kill", "dire_wolf", required=1))
    )
    # Wrong enemy: no progress.
    quest_progress.on_event(p, {"type": "enemy_killed", "name": "Moon Spider"})
    assert p.get_quest("q_test")["objectives"][0]["progress"] == 0  # type: ignore[index]
    # Right enemy by name (underscore target matches spaced display name).
    # The only objective completing auto-finishes the quest.
    quest_progress.on_event(p, {"type": "enemy_killed", "name": "Dire Wolf"})
    assert p.has_completed_quest("q_test")


def test_kill_counts_accumulate_to_required() -> None:
    p = PlayerData()
    p.active_quests.append(_quest(QuestObjective("o", "Kill 3", "kill", "any", required=3)))
    for _ in range(3):
        quest_progress.on_event(p, {"type": "enemy_killed", "archetype": "x"})
    # Completing the only objective auto-completes + pays the quest.
    assert not p.has_active_quest("q_test")
    assert p.has_completed_quest("q_test")


def test_collect_talk_reach_dungeon_matchers() -> None:
    p = PlayerData()
    p.active_quests.append(
        _quest(
            QuestObjective("c", "Collect", "collect", "Crystal Tear"),
            QuestObjective("t", "Talk", "talk", "sage_01"),
            QuestObjective("r", "Reach", "reach", "Crystal Lake"),
            QuestObjective("d", "Dungeon", "enter_dungeon", "crystal_caverns"),
        )
    )
    quest_progress.on_event(p, {"type": "item_collected", "target": "Crystal Tear"})
    quest_progress.on_event(p, {"type": "npc_talked", "target": "sage_01"})
    quest_progress.on_event(p, {"type": "zone_entered", "target": "Crystal Lake"})
    quest_progress.on_event(p, {"type": "dungeon_entered", "target": "crystal_caverns"})
    # All four done → quest completed + reward paid.
    assert p.has_completed_quest("q_test")
    assert "Trophy" in p.inventory
    assert p.gold == 25


def test_auto_complete_pays_reward_and_returns_actions() -> None:
    p = PlayerData()
    p.gold = 100
    p.active_quests.append(
        _quest(
            QuestObjective("o", "Talk", "talk", "npc_1"),
            reward=QuestReward(gold=50, items=["Badge"], xp=30),
        )
    )
    actions = quest_progress.on_event(p, {"type": "npc_talked", "target": "npc_1"})
    assert p.gold == 150
    assert "Badge" in p.inventory
    kinds = {a["kind"] for a in actions}
    assert {"advance_objective", "complete_quest", "give_gold", "give_item", "grant_xp"} <= kinds


def test_event_ignores_unrelated_objectives() -> None:
    p = PlayerData()
    p.active_quests.append(_quest(QuestObjective("o", "Talk", "talk", "npc_1")))
    actions = quest_progress.on_event(p, {"type": "enemy_killed", "name": "Wolf"})
    assert actions == []
    assert p.has_active_quest("q_test")


def test_completed_objective_not_readvanced() -> None:
    p = PlayerData()
    p.active_quests.append(
        _quest(
            QuestObjective("a", "Talk", "talk", "npc_1"),
            QuestObjective("b", "Kill", "kill", "any", required=5),
        )
    )
    quest_progress.on_event(p, {"type": "npc_talked", "target": "npc_1"})
    # Talking again must not change the already-complete objective.
    actions = quest_progress.on_event(p, {"type": "npc_talked", "target": "npc_1"})
    assert actions == []
