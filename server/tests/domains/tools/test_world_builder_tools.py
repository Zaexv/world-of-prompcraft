"""Tests for the WorldBuilder agent tools (catalog spawn + generative mesh)."""

from __future__ import annotations

from typing import Any

import pytest

from src.agents.tools import world_builder
from src.agents.tools.world_builder import (
    create_world_builder_tools,
    set_known_mesh_types,
)


@pytest.fixture(autouse=True)
def _reset_catalog() -> Any:
    """Each test starts with an empty known-mesh catalog."""
    world_builder.KNOWN_MESH_TYPES.clear()
    yield
    world_builder.KNOWN_MESH_TYPES.clear()


def _tools(actions: list[Any]) -> dict[str, Any]:
    return {t.name: t for t in create_world_builder_tools(actions)}


def test_set_known_mesh_types_filters_non_strings() -> None:
    set_known_mesh_types(["tower", "altar", "", 5, None])  # type: ignore[list-item]
    assert world_builder.KNOWN_MESH_TYPES == {"tower", "altar"}


def test_spawn_known_type_emits_action() -> None:
    set_known_mesh_types(["elven_tower"])
    actions: list[Any] = []
    spawn = _tools(actions)["spawn_structure"]

    result = spawn.invoke({"object_type": "elven_tower", "x": 3.0, "z": 4.0})

    assert len(actions) == 1
    assert actions[0]["kind"] == "world_spawn"
    assert actions[0]["params"]["objectType"] == "elven_tower"
    assert actions[0]["params"]["position"] == [3.0, 0, 4.0]
    assert "placeholder" not in result.lower()


def test_spawn_unknown_type_still_emits_action() -> None:
    # Regression: a near-miss id must NOT silently drop — it spawns a marker.
    set_known_mesh_types(["tower"])
    actions: list[Any] = []
    spawn = _tools(actions)["spawn_structure"]

    result = spawn.invoke({"object_type": "definitely_not_a_real_id", "x": 0.0, "z": 0.0})

    assert len(actions) == 1
    assert actions[0]["kind"] == "world_spawn"
    assert "placeholder" in result.lower()


def test_spawn_accepts_anything_when_catalog_empty() -> None:
    actions: list[Any] = []
    spawn = _tools(actions)["spawn_structure"]

    spawn.invoke({"object_type": "whatever", "x": 1.0, "z": 2.0})

    assert len(actions) == 1
    assert actions[0]["params"]["objectType"] == "whatever"


def test_create_custom_mesh_emits_spec() -> None:
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    create.invoke(
        {
            "label": "Crimson Obelisk",
            "x": 5.0,
            "z": -2.0,
            "parts": [
                {"shape": "box", "size": [2, 1, 2], "position": [0, 0.5, 0], "color": "#3344cc"},
                {
                    "shape": "pyramid",
                    "size": [1.5, 2, 1.5],
                    "position": [0, 2, 0],
                    "color": "#cc2233",
                },
            ],
        }
    )

    assert len(actions) == 1
    params = actions[0]["params"]
    assert params["objectType"] == "custom"
    assert params["label"] == "Crimson Obelisk"
    assert len(params["spec"]["parts"]) == 2
    assert params["spec"]["parts"][0]["shape"] == "box"


def test_create_custom_mesh_coerces_invalid_shape_to_box() -> None:
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    create.invoke(
        {
            "label": "Blob",
            "x": 0.0,
            "z": 0.0,
            "parts": [{"shape": "blob", "size": [1, 1, 1], "position": [0, 0, 0], "color": "#fff"}],
        }
    )

    assert actions[0]["params"]["spec"]["parts"][0]["shape"] == "box"


def test_create_custom_mesh_rejects_empty_parts() -> None:
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    result = create.invoke({"label": "Nothing", "x": 0.0, "z": 0.0, "parts": []})

    assert actions == []
    assert "no valid parts" in result.lower()


def test_remove_structure_emits_action() -> None:
    actions: list[Any] = []
    remove = _tools(actions)["remove_structure"]

    remove.invoke({"object_id": "wb_abc123"})

    assert actions[0]["kind"] == "world_remove"
    assert actions[0]["params"]["objectId"] == "wb_abc123"
