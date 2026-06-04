"""Tests for load_npc_definitions — backward compat + appearance field surfacing."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import mock_open, patch

from src.world.npc_definitions import load_npc_definitions

MINIMAL_MANIFEST: dict[str, Any] = {
    "version": "2.1.0",
    "zones": {
        "zone_test": {
            "population": {
                "npcs": [
                    {
                        "id": "test_npc_01",
                        "identity": {"name": "Test NPC", "role": "citizen"},
                        "transform": {"position": [0.0, 0.0, 0.0], "scale": 1.0},
                        "stats": {"max_hp": 100},
                        "ai": {"personality_key": "test_npc_01", "wander_radius": 5},
                    }
                ]
            }
        }
    },
}

MANIFEST_WITH_APPEARANCE: dict[str, Any] = {
    "version": "2.1.0",
    "zones": {
        "zone_a": {
            "population": {
                "npcs": [
                    {
                        "id": "nireg_jenkins",
                        "identity": {"name": "Nireg Jenkins", "role": "oracle"},
                        "transform": {"position": [1.0, 0.0, 2.0], "scale": 1.2},
                        "stats": {"max_hp": 5000},
                        "ai": {
                            "personality_key": "nireg_jenkins",
                            "style": "oracle",
                        },
                        "appearance": {
                            "mesh": "npc_individual_nireg_jenkins",
                            "scale": 1.2,
                        },
                    }
                ]
            }
        }
    },
}


def _patch_manifest(data: dict[str, Any]):
    return patch(
        "builtins.open",
        mock_open(read_data=json.dumps(data)),
    )


def test_load_returns_dict_keyed_by_id():
    with _patch_manifest(MINIMAL_MANIFEST), patch("os.path.exists", return_value=True):
        result = load_npc_definitions()
    assert "test_npc_01" in result
    assert result["test_npc_01"]["name"] == "Test NPC"


def test_core_fields_present():
    with _patch_manifest(MINIMAL_MANIFEST), patch("os.path.exists", return_value=True):
        result = load_npc_definitions()
    npc = result["test_npc_01"]
    assert npc["id"] == "test_npc_01"
    assert npc["position"] == [0.0, 0.0, 0.0]
    assert npc["scale"] == 1.0
    assert npc["personality_key"] == "test_npc_01"


def test_appearance_none_when_absent():
    """Backward compat: NPCs without appearance block get None."""
    with _patch_manifest(MINIMAL_MANIFEST), patch("os.path.exists", return_value=True):
        result = load_npc_definitions()
    assert result["test_npc_01"]["appearance"] is None


def test_appearance_surfaced_when_present():
    with _patch_manifest(MANIFEST_WITH_APPEARANCE), patch("os.path.exists", return_value=True):
        result = load_npc_definitions()
    npc = result["nireg_jenkins"]
    assert npc["appearance"] == {"mesh": "npc_individual_nireg_jenkins", "scale": 1.2}


def test_style_none_when_absent():
    with _patch_manifest(MINIMAL_MANIFEST), patch("os.path.exists", return_value=True):
        result = load_npc_definitions()
    assert result["test_npc_01"]["style"] is None


def test_style_surfaced_from_ai_block():
    with _patch_manifest(MANIFEST_WITH_APPEARANCE), patch("os.path.exists", return_value=True):
        result = load_npc_definitions()
    assert result["nireg_jenkins"]["style"] == "oracle"


def test_returns_empty_on_missing_file():
    with patch("os.path.exists", return_value=False):
        result = load_npc_definitions()
    assert result == {}


def test_deduplicates_across_zones():
    """Same NPC id in two zones: last-write wins (no crash)."""
    duplicate_manifest: dict[str, Any] = {
        "version": "2.1.0",
        "zones": {
            "zone_a": {
                "population": {
                    "npcs": [
                        {
                            "id": "dup_01",
                            "identity": {"name": "Dup A", "role": "citizen"},
                            "transform": {"position": [0.0, 0.0, 0.0], "scale": 1.0},
                            "stats": {"max_hp": 100},
                            "ai": {"personality_key": "dup_01"},
                        }
                    ]
                }
            },
            "zone_b": {
                "population": {
                    "npcs": [
                        {
                            "id": "dup_01",
                            "identity": {"name": "Dup B", "role": "citizen"},
                            "transform": {"position": [1.0, 0.0, 0.0], "scale": 1.0},
                            "stats": {"max_hp": 200},
                            "ai": {"personality_key": "dup_01"},
                        }
                    ]
                }
            },
        },
    }
    with _patch_manifest(duplicate_manifest), patch("os.path.exists", return_value=True):
        result = load_npc_definitions()
    assert "dup_01" in result  # no crash
