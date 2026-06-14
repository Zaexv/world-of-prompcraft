"""Test the /npc/archetypes endpoint used by the NPC Designer dropdowns."""

from __future__ import annotations

from fastapi.testclient import TestClient

import src.main as main
from src.agents.personalities.archetypes import ARCHETYPES


def test_archetypes_endpoint_lists_all() -> None:
    client = TestClient(main.app)
    resp = client.get("/npc/archetypes")
    assert resp.status_code == 200
    body = resp.json()
    keys = {a["key"] for a in body["archetypes"]}
    assert keys == set(ARCHETYPES)
    merchant = next(a for a in body["archetypes"] if a["key"] == "friendly_merchant")
    assert "trade" in merchant["allowed_tools"]
    assert "offense" not in merchant["allowed_tools"]
