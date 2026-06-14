"""Editor-authored NPCs carry inline archetype + flavor_prompt through to NPCData."""

from __future__ import annotations

from typing import TYPE_CHECKING

from src.world import world_state as ws_mod

if TYPE_CHECKING:
    import pytest


def test_inline_archetype_and_flavor_override_personality_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_defs = {
        "npc_editor_1": {
            "id": "npc_editor_1",
            "name": "Greta the Smith",
            "role": "blacksmith",
            "position": [1.0, 0.0, 2.0],
            "initial_hp": 0,
            "personality_key": "friendly",  # not in personalities.json
            "scale": 1.0,
            "style": "pavilion",
            "appearance": None,
            "archetype": "friendly_merchant",
            "flavor_prompt": "A gruff but kind smith from the north.",
        }
    }
    monkeypatch.setattr(ws_mod, "get_npc_definitions", lambda: fake_defs)

    ws = ws_mod.WorldState()
    ws.refresh_npcs()
    npc = ws.npcs["npc_editor_1"]

    assert npc.archetype == "friendly_merchant"
    assert npc.personality == "A gruff but kind smith from the north."
    assert npc.allowed_tools is not None
    assert "trade" in npc.allowed_tools
    assert "offense" not in npc.allowed_tools

    ws.npcs.pop("npc_editor_1", None)
