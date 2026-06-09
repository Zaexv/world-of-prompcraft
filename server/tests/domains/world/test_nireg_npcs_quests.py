"""Tests for the Fort Malaka NPCs, quests, and canon lore added from the Notion brief."""

from __future__ import annotations

from src.agents.personalities.templates import NPC_PERSONALITIES
from src.rag.knowledge_base import KNOWLEDGE_BASE
from src.rag.retriever import LoreRetriever
from src.world.npc_definitions import get_npc_definitions
from src.world.quests import OBJECTIVE_KINDS, QUEST_TEMPLATES, instantiate
from src.world.world_state import WorldState

NEW_NPCS = [
    "juan_pescador",
    "guardia_abelardo",
    "luisa_patatera",
    "sancho_barriga",
    "alonso_quijano",
    "zaex_01",
    "nireg_jenkins",
    "eltito_01",
]

NEW_QUESTS = [
    "juan_story",
    "malaka_thieves",
    "glorious_potatoes",
    "make_him_laugh",
    "heroes_reunion",
]


class TestPersonalities:
    def test_all_personality_keys_exist(self) -> None:
        for key in NEW_NPCS:
            assert key in NPC_PERSONALITIES, key

    def test_personalities_are_well_formed(self) -> None:
        for key in NEW_NPCS:
            p = NPC_PERSONALITIES[key]
            assert p["name"]
            assert p["archetype"]
            assert p["initial_hp"] > 0
            assert len(p["system_prompt"]) > 100

    def test_eltito_wired_into_chain_quest(self) -> None:
        assert "heroes_reunion" in NPC_PERSONALITIES["eltito_01"]["system_prompt"]


class TestManifestPlacement:
    def test_all_npcs_in_manifest(self) -> None:
        defs = get_npc_definitions()
        for npc_id in NEW_NPCS:
            assert npc_id in defs, npc_id

    def test_nireg_restatted(self) -> None:
        defs = get_npc_definitions()
        assert defs["nireg_jenkins"]["initial_hp"] == 900
        assert defs["nireg_jenkins"]["zone_id"] == "fort_malaka"

    def test_heroes_relocated_to_fort_malaka(self) -> None:
        defs = get_npc_definitions()
        assert defs["zaex_01"]["zone_id"] == "fort_malaka"
        assert defs["eltito_01"]["zone_id"] == "fort_malaka"

    def test_no_personality_falls_back_to_stranger(self) -> None:
        ws = WorldState()
        ws.refresh_npcs()
        for npc_id in NEW_NPCS:
            assert "mysterious stranger" not in ws.npcs[npc_id].personality, npc_id


class TestQuests:
    def test_all_quests_instantiate(self) -> None:
        for quest_id in NEW_QUESTS:
            assert instantiate(quest_id) is not None, quest_id

    def test_objective_kinds_are_valid(self) -> None:
        for quest_id in NEW_QUESTS:
            quest = QUEST_TEMPLATES[quest_id]
            for obj in quest.objectives:
                assert obj.kind in OBJECTIVE_KINDS, (quest_id, obj.kind)

    def test_rewards_are_non_zero(self) -> None:
        for quest_id in NEW_QUESTS:
            reward = QUEST_TEMPLATES[quest_id].reward
            assert reward.gold > 0 and reward.xp > 0 and reward.items

    def test_chain_quest_routes_through_three_heroes(self) -> None:
        chain = QUEST_TEMPLATES["heroes_reunion"]
        targets = [(o.kind, o.target) for o in chain.objectives]
        assert targets == [
            ("talk", "eltito_01"),
            ("talk", "nireg_jenkins"),
            ("talk", "zaex_01"),
        ]


class TestCanonLore:
    def test_cargarath_lore_present(self) -> None:
        assert any("Cárgarath" in e["content"] for e in KNOWLEDGE_BASE)

    def test_retriever_surfaces_canon(self) -> None:
        r = LoreRetriever()
        for query in ["who killed Cargarath", "King Paco de las Torres", "Tanis Desert oracle"]:
            top = r.retrieve(query, top_k=3)
            assert top, query
            assert any(e["category"] == "promptcraft_lore" for e in top), query
