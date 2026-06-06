"""Tests for NPC quest tools + improvised quest generation."""

from __future__ import annotations

from typing import Any

import pytest

from src.agents.quests.generator import (
    QuestObjectiveProposal,
    QuestProposal,
    clamp_proposal,
    generate_quest,
)
from src.agents.tools.quest import create_quest_tools


def _tools(world: dict[str, Any]) -> dict[str, Any]:
    pending: list[Any] = []
    tools = {t.name: t for t in create_quest_tools(pending, world)}
    return {"pending": pending, **tools}


def _world() -> dict[str, Any]:
    return {
        "player": {"level": 3, "active_quests": [], "completed_quests": [], "inventory": []},
        "player_id": "alice",
        "self_npc_id": "sage_01",
        "npcs": {"sage_01": {"name": "Elyria the Sage"}},
    }


def test_offer_quest_emits_accept_with_full_instance() -> None:
    t = _tools(_world())
    msg = t["offer_quest"].invoke({"quest_id": "crystal_tear"})
    assert "Crystal Tear" in msg
    action = t["pending"][0]
    assert action["kind"] == "accept_quest"
    assert action["params"]["player_id"] == "alice"
    quest = action["params"]["quest"]
    assert quest["id"] == "crystal_tear"
    assert quest["objectives"]  # carries the full objective list


def test_offer_quest_unknown_id() -> None:
    t = _tools(_world())
    msg = t["offer_quest"].invoke({"quest_id": "nope"})
    assert "Unknown quest" in msg
    assert t["pending"] == []


def test_offer_quest_description_lists_available_ids() -> None:
    t = _tools(_world())
    assert "crystal_tear" in t["offer_quest"].description


def test_offer_custom_quest_clamps_and_emits() -> None:
    t = _tools(_world())
    msg = t["offer_custom_quest"].invoke(
        {
            "title": "Wolf Trouble",
            "description": "Thin the pack.",
            "objective_kind": "kill",
            "objective_target": "dire_wolf",
            "objective_description": "Kill 2 dire wolves",
            "required": 2,
            "reward_gold": 999999,
            "reward_item": "Wolf Pelt",
        }
    )
    assert "Wolf Trouble" in msg
    quest = t["pending"][0]["params"]["quest"]
    assert quest["origin"] == "improvised"
    assert quest["objectives"][0]["kind"] == "kill"
    assert quest["objectives"][0]["required"] == 2
    # Reward gold clamped to the level cap (well below 999999).
    assert quest["reward"]["gold"] < 1000


def test_offer_custom_quest_invalid_kind_falls_back_to_talk() -> None:
    t = _tools(_world())
    t["offer_custom_quest"].invoke(
        {
            "title": "Mystery",
            "description": "?",
            "objective_kind": "teleport",  # not a real kind
            "objective_target": "void",
            "objective_description": "do the impossible",
        }
    )
    obj = t["pending"][0]["params"]["quest"]["objectives"][0]
    assert obj["kind"] == "talk"
    assert obj["target"] == "sage_01"


def test_advance_and_complete_quest_inject_player_id() -> None:
    t = _tools(_world())
    t["advance_quest_objective"].invoke(
        {"quest_id": "crystal_tear", "objective_id": "return_elyria"}
    )
    adv = t["pending"][0]
    assert adv["kind"] == "advance_objective"
    assert adv["params"]["player_id"] == "alice"
    assert adv["params"]["quest_id"] == "crystal_tear"

    t["complete_quest"].invoke({"quest_id": "crystal_tear"})
    comp = t["pending"][1]
    assert comp["kind"] == "complete_quest"
    assert comp["params"]["player_id"] == "alice"
    assert comp["params"]["quest_id"] == "crystal_tear"


# ── Generator ───────────────────────────────────────────────────────────────


def test_clamp_proposal_caps_objectives_and_rewards() -> None:
    proposal = QuestProposal(
        title="Epic Saga",
        description="Way too much.",
        objectives=[
            QuestObjectiveProposal(kind="kill", target="any", description="a"),
            QuestObjectiveProposal(kind="collect", target="Gem", description="b"),
            QuestObjectiveProposal(kind="talk", target="npc_1", description="c"),
            QuestObjectiveProposal(kind="reach", target="Zone", description="d"),
        ],
        reward_gold=10**9,
        reward_items=["a", "b", "c", "d"],
        reward_xp=10**9,
    )
    inst = clamp_proposal(proposal, "npc_1", "NPC", player_level=2)
    assert len(inst.objectives) == 3  # capped
    assert len(inst.reward.items) == 2  # capped
    assert inst.reward.gold <= 60 + 40 * 2
    assert inst.reward.xp <= 40 + 30 * 2


@pytest.mark.asyncio
async def test_generate_quest_falls_back_on_llm_error() -> None:
    class _BoomLLM:
        def with_structured_output(self, _schema: object) -> object:
            raise RuntimeError("no llm")

    inst = await generate_quest(_BoomLLM(), "guard_01", "Aldric", {"zone": "Village"}, 1)  # type: ignore[arg-type]
    assert inst.origin == "improvised"
    assert inst.objectives  # always satisfiable fallback
    assert inst.objectives[0].kind == "talk"


@pytest.mark.asyncio
async def test_generate_quest_uses_structured_output() -> None:
    proposal = QuestProposal(
        title="Find the Relic",
        description="A relic awaits.",
        objectives=[QuestObjectiveProposal(kind="collect", target="Relic", description="get it")],
        reward_gold=20,
    )

    class _Structured:
        async def ainvoke(self, _messages: object) -> QuestProposal:
            return proposal

    class _LLM:
        def with_structured_output(self, _schema: object) -> _Structured:
            return _Structured()

    inst = await generate_quest(_LLM(), "sage_01", "Elyria", {"zone": "Lake"}, 5)  # type: ignore[arg-type]
    assert inst.title == "Find the Relic"
    assert inst.objectives[0].kind == "collect"
    assert inst.reward.gold == 20
