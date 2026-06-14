"""Tests for the NPC Designer: tools, persistence, and handler apply logic."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from src.agents.tools.npc_designer import create_npc_designer_tools

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


def test_create_npc_tool_appends_action() -> None:
    actions: list[Any] = []
    tools = {t.name: t for t in create_npc_designer_tools(actions)}
    out = tools["create_npc"].invoke(
        {"name": "Greta", "archetype": "friendly_merchant", "flavor_prompt": "A gruff smith."}
    )
    assert "Greta" in out
    assert len(actions) == 1
    assert actions[0]["kind"] == "npc_create"
    assert actions[0]["params"]["archetype"] == "friendly_merchant"


def test_create_npc_tool_rejects_unknown_archetype() -> None:
    actions: list[Any] = []
    tools = {t.name: t for t in create_npc_designer_tools(actions)}
    out = tools["create_npc"].invoke(
        {"name": "X", "archetype": "wizard_of_oz", "flavor_prompt": "y"}
    )
    assert "Unknown archetype" in out
    assert actions == []


def test_list_archetypes_mentions_tools() -> None:
    tools = {t.name: t for t in create_npc_designer_tools([])}
    out = tools["list_archetypes"].invoke({})
    assert "friendly_merchant" in out
    assert "trade" in out


def test_designed_npc_persistence_roundtrip(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import src.world.designed_npcs as dn

    data_file = tmp_path / "designed_npcs.json"
    monkeypatch.setattr(dn, "DATA_FILE", str(data_file))

    dn.save_designed_npc(
        {
            "npc_id": "des_abc",
            "name": "Greta",
            "archetype": "friendly_merchant",
            "flavor_prompt": "A gruff smith.",
            "initial_hp": 0,
            "position": [1.0, 0.0, 2.0],
        }
    )
    loaded = dn.load_designed_npcs()
    assert loaded["des_abc"]["name"] == "Greta"

    assert dn.update_designed_npc("des_abc", {"name": "Greta the Bold"})
    assert json.loads(data_file.read_text())["des_abc"]["name"] == "Greta the Bold"
    assert not dn.update_designed_npc("des_missing", {"name": "x"})


def test_upsert_designed_npc_applies_archetype_tool_limit() -> None:
    from src.world.world_state import WorldState

    ws = WorldState()
    npc = ws.upsert_designed_npc(
        {
            "npc_id": "des_test1",
            "name": "Healer Joan",
            "archetype": "friendly_healer",
            "flavor_prompt": "Kind and calm.",
            "initial_hp": 0,
            "position": [0.0, 0.0, 0.0],
        }
    )
    assert npc.allowed_tools is not None
    assert "support" in npc.allowed_tools
    assert "offense" not in npc.allowed_tools
    # cleanup so the singleton world doesn't leak into other tests
    ws.npcs.pop("des_test1", None)
