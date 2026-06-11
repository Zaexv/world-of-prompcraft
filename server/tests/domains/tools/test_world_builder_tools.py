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


def test_create_custom_mesh_keeps_new_shapes_and_valid_mat() -> None:
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    create.invoke(
        {
            "label": "Dog",
            "x": 0.0,
            "z": 0.0,
            "parts": [
                {
                    "shape": "capsule",
                    "size": [0.3, 1.2],
                    "position": [0, 0.6, 0],
                    "color": "#8B4513",
                    "mat": "metal",
                    "axis": "z",
                },
                {
                    "shape": "torus",
                    "size": [0.5, 0.15],
                    "position": [0, 1, 0],
                    "color": "#ffcc00",
                    "mat": "chrome",  # not a valid finish — must be dropped
                },
            ],
        }
    )

    parts = actions[0]["params"]["spec"]["parts"]
    assert parts[0]["shape"] == "capsule"
    assert parts[0]["mat"] == "metal"
    assert parts[0]["axis"] == "z"
    assert parts[1]["shape"] == "torus"
    assert "mat" not in parts[1]
    assert "axis" not in parts[1]


def test_create_custom_mesh_rejects_empty_parts() -> None:
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    result = create.invoke({"label": "Nothing", "x": 0.0, "z": 0.0, "parts": []})

    assert actions == []
    assert "no valid parts" in result.lower()


def test_create_custom_mesh_unburies_swallowed_detail_spheres() -> None:
    # Eyes placed fully inside the head sphere must be pushed to its surface.
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    create.invoke(
        {
            "label": "Dog",
            "x": 0.0,
            "z": 0.0,
            "parts": [
                {"shape": "sphere", "size": [0.25], "position": [0.7, 0.4, 0], "color": "#841"},
                # dist from head center ~0.187 + r 0.05 < 0.25 → buried
                {"shape": "sphere", "size": [0.05], "position": [0.85, 0.45, 0.1], "color": "#000"},
            ],
        }
    )

    head, eye = actions[0]["params"]["spec"]["parts"]
    assert head["position"] == [0.7, 0.4, 0.0]  # parent untouched
    import math

    d = math.dist(eye["position"], head["position"])
    assert d == pytest.approx(0.25, abs=1e-6)  # centered on the surface
    # direction preserved: still in front (+x), above (+y), left (+z) of head
    assert eye["position"][0] > 0.7
    assert eye["position"][2] > 0


def test_create_custom_mesh_unburies_non_sphere_details() -> None:
    # Cone ears swallowed by the head sphere must surface too.
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    create.invoke(
        {
            "label": "Dog",
            "x": 0.0,
            "z": 0.0,
            "parts": [
                {"shape": "sphere", "size": [0.25], "position": [0.7, 0.4, 0], "color": "#841"},
                # dist ~0.18 + bounding radius 0.05 < 0.25 → buried
                {
                    "shape": "cone",
                    "size": [0.05, 0.1],
                    "position": [0.7, 0.55, 0.1],
                    "color": "#841",
                },
            ],
        }
    )

    head, ear = actions[0]["params"]["spec"]["parts"]
    import math

    d = math.dist(ear["position"], head["position"])
    assert d == pytest.approx(0.25, abs=1e-6)
    assert ear["position"][1] > 0.55  # still above the head, direction kept


def test_create_custom_mesh_leaves_protruding_details_alone() -> None:
    actions: list[Any] = []
    create = _tools(actions)["create_custom_mesh"]

    create.invoke(
        {
            "label": "Dog",
            "x": 0.0,
            "z": 0.0,
            "parts": [
                {"shape": "sphere", "size": [0.25], "position": [0.7, 0.4, 0], "color": "#841"},
                {"shape": "sphere", "size": [0.05], "position": [0.95, 0.45, 0.1], "color": "#000"},
            ],
        }
    )

    eye = actions[0]["params"]["spec"]["parts"][1]
    assert eye["position"] == [0.95, 0.45, 0.1]


def test_create_creature_builds_correct_quadruped_anatomy() -> None:
    actions: list[Any] = []
    creature = _tools(actions)["create_creature"]

    creature.invoke(
        {
            "label": "Perro Salchicha",
            "x": 10.0,
            "z": 20.0,
            "color": "#8B4513",
            "body_length": 1.3,
            "body_radius": 0.18,
            "leg_length": 0.12,
            "ear_style": "floppy",
        }
    )

    assert len(actions) == 1
    params = actions[0]["params"]
    assert params["objectType"] == "custom"
    parts = params["spec"]["parts"]

    body = parts[0]
    assert body["shape"] == "capsule"
    assert body["axis"] == "x"

    head = parts[1]
    assert head["position"][0] > 0.6  # at the +x end of the body

    eyes = [p for p in parts if p["color"] == "#1a1a1a"]
    assert len(eyes) == 2
    assert eyes[0]["position"][2] == -eyes[1]["position"][2]  # mirrored across z
    assert eyes[0]["position"][0] > head["position"][0]  # on the front face

    # floppy ears = flattened spheres, mirrored, near the head
    ears = [p for p in parts if p["shape"] == "sphere" and p not in eyes and p is not head]
    assert len(ears) == 2
    assert ears[0]["position"][2] == -ears[1]["position"][2]

    legs = [p for p in parts if p["shape"] == "cylinder"]
    assert len(legs) == 4
    xs = sorted({leg["position"][0] for leg in legs})
    zs = sorted({leg["position"][2] for leg in legs})
    assert len(xs) == 2 and xs[0] == -xs[1]  # front + back pair
    assert len(zs) == 2 and zs[0] == -zs[1]  # left + right pair
    assert all(leg["position"][1] < body["position"][1] for leg in legs)  # below body


def test_create_creature_pointy_ears_are_cones() -> None:
    actions: list[Any] = []
    creature = _tools(actions)["create_creature"]

    creature.invoke({"label": "Cat", "x": 0.0, "z": 0.0, "ear_style": "pointy"})

    parts = actions[0]["params"]["spec"]["parts"]
    cones = [p for p in parts if p["shape"] == "cone"]
    assert len(cones) == 2
    head = parts[1]
    assert all(c["position"][1] > head["position"][1] for c in cones)  # on top of head


def test_create_creature_insect_has_glass_wings_and_no_legs() -> None:
    actions: list[Any] = []
    creature = _tools(actions)["create_creature"]

    creature.invoke({"label": "Abeja", "x": 0.0, "z": 0.0, "kind": "insect", "color": "#FFD700"})

    parts = actions[0]["params"]["spec"]["parts"]
    wings = [p for p in parts if p.get("mat") == "glass"]
    assert len(wings) == 2
    assert wings[0]["position"][2] == -wings[1]["position"][2]  # mirrored across z
    assert not [p for p in parts if p["shape"] == "cylinder"]  # hovers, no legs
    assert all(p["position"][1] > 0.3 for p in parts)  # off the ground


def test_create_creature_bird_has_beak_and_two_legs() -> None:
    actions: list[Any] = []
    creature = _tools(actions)["create_creature"]

    creature.invoke({"label": "Hen", "x": 0.0, "z": 0.0, "kind": "bird"})

    parts = actions[0]["params"]["spec"]["parts"]
    beaks = [p for p in parts if p["shape"] == "cone"]
    assert len(beaks) == 1
    legs = [p for p in parts if p["shape"] == "cylinder"]
    assert len(legs) == 2
    assert legs[0]["position"][2] == -legs[1]["position"][2]


def test_create_creature_fish_has_fins_and_hovers() -> None:
    actions: list[Any] = []
    creature = _tools(actions)["create_creature"]

    creature.invoke({"label": "Trucha", "x": 0.0, "z": 0.0, "kind": "fish"})

    parts = actions[0]["params"]["spec"]["parts"]
    assert all(p["shape"] == "sphere" for p in parts)  # ellipsoid body + fins + eyes
    assert len(parts) >= 6
    assert all(p["position"][1] > 0.2 for p in parts)


def test_remove_structure_emits_action() -> None:
    actions: list[Any] = []
    remove = _tools(actions)["remove_structure"]

    remove.invoke({"object_id": "wb_abc123"})

    assert actions[0]["kind"] == "world_remove"
    assert actions[0]["params"]["objectId"] == "wb_abc123"
