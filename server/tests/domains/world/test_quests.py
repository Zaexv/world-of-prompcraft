"""Tests for the abstract quest model and PlayerData quest API."""

from __future__ import annotations

from src.world.player_state import PlayerData
from src.world.quests import (
    QUEST_TEMPLATES,
    QuestInstance,
    QuestObjective,
    QuestReward,
    instantiate,
    template_ids,
)


def test_template_ids_lists_curated_quests() -> None:
    ids = template_ids()
    assert "sacred_flame" in ids
    assert "crystal_tear" in ids
    assert "village_patrol" in ids


def test_instantiate_resets_progress() -> None:
    inst = instantiate("village_patrol", "Captain Aldric")
    assert inst is not None
    assert inst.status == "active"
    assert all(o.progress == 0 and not o.completed for o in inst.objectives)
    # Curated kill objective carries a real required count.
    kill = next(o for o in inst.objectives if o.kind == "kill")
    assert kill.required == 3


def test_instantiate_unknown_returns_none() -> None:
    assert instantiate("does_not_exist") is None


def test_instance_round_trips_storage_dict() -> None:
    inst = instantiate("sacred_flame")
    assert inst is not None
    restored = QuestInstance.from_storage_dict(inst.to_storage_dict())
    assert restored.id == inst.id
    assert restored.title == inst.title
    assert [o.kind for o in restored.objectives] == [o.kind for o in inst.objectives]
    assert restored.reward.gold == inst.reward.gold


def test_objective_migrates_legacy_shape() -> None:
    # Legacy stored objective: closed enum `type`, count in `target`.
    legacy = {
        "id": "kill_hostiles",
        "description": "Defeat 3 hostile creatures",
        "type": "kill_enemies",
        "target": "3",
    }
    obj = QuestObjective.from_storage_dict(legacy)
    assert obj.kind == "kill"
    assert obj.required == 3
    assert obj.target == "3"


def test_objective_migrates_legacy_collect_and_talk() -> None:
    assert QuestObjective.from_storage_dict({"id": "x", "type": "collect_item"}).kind == "collect"
    assert QuestObjective.from_storage_dict({"id": "y", "type": "talk_npc"}).kind == "talk"


def test_reward_from_legacy_single_item() -> None:
    reward = QuestReward.from_dict({"reward_item": "Amulet", "reward_description": "Shiny"})
    assert reward.items == ["Amulet"]
    assert reward.description == "Shiny"


def test_client_dict_has_progress_and_reward() -> None:
    inst = instantiate("village_patrol")
    assert inst is not None
    cd = inst.to_client_dict()
    assert cd["name"] == "Village Patrol"
    assert cd["objectives"][0]["required"] == 3
    assert cd["objectives"][0]["progress"] == 0
    assert cd["reward"]["gold"] == QUEST_TEMPLATES["village_patrol"].reward.gold
    # Backward-compatible flat fields remain.
    assert cd["rewardItem"] == "Guard's Badge of Honor"


# ── PlayerData quest API ────────────────────────────────────────────────────


def test_accept_template_adds_quest() -> None:
    p = PlayerData()
    assert p.accept_template("crystal_tear") is True
    assert p.has_active_quest("crystal_tear")
    # to_dict exposes it under the client camelCase key.
    assert p.to_dict()["activeQuests"][0]["id"] == "crystal_tear"


def test_accept_quest_dedupes() -> None:
    p = PlayerData()
    assert p.accept_template("crystal_tear") is True
    assert p.accept_template("crystal_tear") is False
    assert len(p.active_quests) == 1


def test_accept_quest_skips_completed() -> None:
    p = PlayerData()
    p.completed_quests.append("crystal_tear")
    assert p.accept_template("crystal_tear") is False


def test_complete_quest_returns_reward_and_moves_it() -> None:
    p = PlayerData()
    p.accept_template("village_patrol", "Captain Aldric")
    reward = p.complete_quest("village_patrol")
    assert reward is not None
    assert reward.gold == QUEST_TEMPLATES["village_patrol"].reward.gold
    assert not p.has_active_quest("village_patrol")
    assert p.has_completed_quest("village_patrol")


def test_complete_quest_unknown_returns_none() -> None:
    assert PlayerData().complete_quest("nope") is None


def test_advance_objective_marks_complete() -> None:
    p = PlayerData()
    p.accept_template("crystal_tear")
    p.advance_objective("crystal_tear", "return_elyria")
    quest = p.get_quest("crystal_tear")
    assert quest is not None
    obj = next(o for o in quest["objectives"] if o["id"] == "return_elyria")
    assert obj["completed"] is True


def test_all_objectives_complete() -> None:
    p = PlayerData()
    p.accept_template("crystal_tear")
    assert p.all_objectives_complete("crystal_tear") is False
    quest = p.get_quest("crystal_tear")
    assert quest is not None
    for obj in quest["objectives"]:
        obj["completed"] = True
    assert p.all_objectives_complete("crystal_tear") is True
