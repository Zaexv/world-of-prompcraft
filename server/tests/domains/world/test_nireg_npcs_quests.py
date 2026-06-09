"""Tests for the Fort Malaka NPCs, quests, and canon lore added from the Notion brief."""

from __future__ import annotations

from src.agents.personalities.templates import NPC_PERSONALITIES
from src.rag.knowledge_base import KNOWLEDGE_BASE
from src.rag.retriever import LoreRetriever
from src.world import quest_progress
from src.world.npc_definitions import get_npc_definitions
from src.world.player_state import PlayerData
from src.world.quests import (
    MANUAL_OBJECTIVE_KIND,
    OBJECTIVE_KINDS,
    QUEST_GIVER_IDS,
    QUEST_TEMPLATES,
    instantiate,
    quest_giver_map,
)
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
        allowed = set(OBJECTIVE_KINDS) | {MANUAL_OBJECTIVE_KIND}
        for quest_id in NEW_QUESTS:
            quest = QUEST_TEMPLATES[quest_id]
            for obj in quest.objectives:
                assert obj.kind in allowed, (quest_id, obj.kind)

    def test_manual_kind_is_not_generator_selectable(self) -> None:
        # MANUAL_OBJECTIVE_KIND must stay out of OBJECTIVE_KINDS so the custom-quest
        # generator can't mint an improvised quest with an unfulfillable objective.
        assert MANUAL_OBJECTIVE_KIND not in OBJECTIVE_KINDS

    def test_rewards_are_non_zero(self) -> None:
        for quest_id in NEW_QUESTS:
            reward = QUEST_TEMPLATES[quest_id].reward
            assert reward.gold > 0 and reward.xp > 0 and reward.items

    def test_no_uncompletable_collect_objectives(self) -> None:
        # 'collect' only advances from dungeon loot (ws/handler.py item_collected),
        # so a collect target with no dungeon drop is uncompletable. These Fort
        # Malaka quests must rely on completable kinds only.
        for quest_id in NEW_QUESTS:
            for obj in QUEST_TEMPLATES[quest_id].objectives:
                assert obj.kind != "collect", (quest_id, obj.id)

    def test_chain_quest_routes_through_three_heroes(self) -> None:
        chain = QUEST_TEMPLATES["heroes_reunion"]
        targets = [(o.kind, o.target) for o in chain.objectives]
        assert targets == [
            ("talk", "eltito_01"),
            ("talk", "nireg_jenkins"),
            (MANUAL_OBJECTIVE_KIND, "zaex_01"),
        ]


class TestQuestReliability:
    """Regression tests for the talk-objective auto-advance pitfalls."""

    def _accept(self, quest_id: str) -> PlayerData:
        p = PlayerData()
        quest = instantiate(quest_id)
        assert quest is not None
        p.active_quests.append(quest.to_storage_dict())
        return p

    def _obj(self, player: PlayerData, quest_id: str, obj_id: str) -> dict:
        quest = player.get_quest(quest_id)
        assert quest is not None
        return next(o for o in quest["objectives"] if o["id"] == obj_id)

    def test_return_to_giver_not_completed_on_accept_turn(self) -> None:
        # Accepting from the giver fires npc_talked(giver) on the same turn; a plain
        # talk return step would wrongly complete. The manual 'confirm' kind must not.
        cases = [
            ("heroes_reunion", "zaex_01", "return_zaex"),
            ("glorious_potatoes", "luisa_patatera", "return_luisa"),
            ("malaka_thieves", "guardia_abelardo", "report_abelardo"),
            ("make_him_laugh", "sancho_barriga", "tell_sancho"),
        ]
        for quest_id, giver, obj_id in cases:
            p = self._accept(quest_id)
            quest_progress.on_event(p, {"type": "npc_talked", "target": giver})
            assert not self._obj(p, quest_id, obj_id)["completed"], (quest_id, obj_id)

    def test_make_him_laugh_gate_not_bypassed_by_talking(self) -> None:
        # Simply talking to Alonso must NOT satisfy "make him laugh".
        p = self._accept("make_him_laugh")
        quest_progress.on_event(p, {"type": "npc_talked", "target": "alonso_quijano"})
        assert not self._obj(p, "make_him_laugh", "amuse_alonso")["completed"]

    def test_manual_advance_completes_and_rewards(self) -> None:
        # The explicit advance path completes the confirm step and, once every
        # objective is done, the safety net pays out (mirrors world_state apply).
        p = self._accept("make_him_laugh")
        p.advance_objective("make_him_laugh", "amuse_alonso")
        p.advance_objective("make_him_laugh", "tell_sancho")
        assert p.all_objectives_complete("make_him_laugh")
        reward = p.complete_quest("make_him_laugh")
        assert reward is not None and reward.gold > 0
        # Idempotent: a second completion pays nothing.
        assert p.complete_quest("make_him_laugh") is None

    def test_auto_objectives_still_advance(self) -> None:
        # The non-confirm steps must still progress from their events.
        p = self._accept("heroes_reunion")
        quest_progress.on_event(p, {"type": "npc_talked", "target": "eltito_01"})
        quest_progress.on_event(p, {"type": "npc_talked", "target": "nireg_jenkins"})
        assert self._obj(p, "heroes_reunion", "consult_tito")["completed"]
        assert self._obj(p, "heroes_reunion", "consult_nireg")["completed"]
        # ...but the quest is NOT done until the manual return is confirmed.
        assert not p.all_objectives_complete("heroes_reunion")


class TestQuestGiverFlag:
    """The '!' marker is driven by an isQuestGiver flag — keep it consistent."""

    def test_manifest_flag_matches_quest_templates(self) -> None:
        # Every manifest NPC that owns a curated quest must be flagged, and no
        # other NPC may be. Orphan givers (ids not present in the manifest) are
        # ignored here — they have no NPC to mark.
        defs = get_npc_definitions()
        flagged = {nid for nid, d in defs.items() if d.get("is_quest_giver")}
        expected = {gid for gid in QUEST_GIVER_IDS if gid in defs}
        assert flagged == expected, (flagged, expected)

    def test_new_givers_are_flagged(self) -> None:
        defs = get_npc_definitions()
        for nid in [
            "juan_pescador",
            "guardia_abelardo",
            "luisa_patatera",
            "sancho_barriga",
            "zaex_01",
        ]:
            assert defs[nid]["is_quest_giver"], nid

    def test_participant_only_npcs_not_flagged(self) -> None:
        # Alonso and Nireg only participate in quests; they don't own one.
        defs = get_npc_definitions()
        assert not defs["alonso_quijano"]["is_quest_giver"]
        assert not defs["nireg_jenkins"]["is_quest_giver"]

    def test_to_dict_emits_flag(self) -> None:
        ws = WorldState()
        ws.refresh_npcs()
        assert ws.npcs["zaex_01"].to_dict()["isQuestGiver"] is True
        assert ws.npcs["nireg_jenkins"].to_dict()["isQuestGiver"] is False

    def test_manifest_quest_ids_match_templates(self) -> None:
        # questIds drives hiding the '!' once taken/completed; it must mirror the
        # giver→quest map for every giver present in the manifest.
        defs = get_npc_definitions()
        expected = quest_giver_map()
        for nid, ids in expected.items():
            if nid in defs:
                assert sorted(defs[nid]["quest_ids"]) == ids, nid
        # Non-givers carry no quest ids.
        assert defs["alonso_quijano"]["quest_ids"] == []
        assert defs["nireg_jenkins"]["quest_ids"] == []

    def test_to_dict_emits_quest_ids(self) -> None:
        ws = WorldState()
        ws.refresh_npcs()
        assert ws.npcs["zaex_01"].to_dict()["questIds"] == ["heroes_reunion"]
        assert ws.npcs["nireg_jenkins"].to_dict()["questIds"] == []


class TestCanonLore:
    def test_cargarath_lore_present(self) -> None:
        assert any("Cárgarath" in e["content"] for e in KNOWLEDGE_BASE)

    def test_retriever_surfaces_canon(self) -> None:
        r = LoreRetriever()
        for query in ["who killed Cargarath", "King Paco de las Torres", "Tanis Desert oracle"]:
            top = r.retrieve(query, top_k=3)
            assert top, query
            assert any(e["category"] == "promptcraft_lore" for e in top), query
