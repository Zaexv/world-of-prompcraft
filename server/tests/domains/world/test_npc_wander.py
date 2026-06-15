"""Tests for server-authoritative NPC wandering (src/world/npc_wander.py)."""

from __future__ import annotations

import math
import random
from typing import Any

import pytest

from src.world.npc_wander import ACTIVE_RADIUS, WANDER_RADIUS, step_npcs
from src.world.world_geometry import (
    Footprint,
    WorldGeometry,
    load_world_geometry,
)
from src.world.world_state import NPCData, WorldState


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


def _spawn(world: WorldState, npc_id: str, position: list[float], hp: int = 100) -> NPCData:
    npc = NPCData(
        npc_id=npc_id,
        name="Walker",
        personality="test",
        hp=hp,
        max_hp=100,
        position=position,
    )
    world.npcs[npc_id] = npc
    return npc


def test_no_players_no_movement() -> None:
    world = WorldState()
    _spawn(world, "n1", [10.0, 0.0, 10.0])

    updates = step_npcs(world, {}, random.Random(42))

    assert updates == []
    assert world.npcs["n1"].position == [10.0, 0.0, 10.0]


def test_npc_near_player_wanders_within_radius_of_home() -> None:
    world = WorldState()
    _spawn(world, "n1", [10.0, 2.0, 10.0])
    player = world.get_player("p1")
    player.position = [12.0, 0.0, 12.0]

    homes: dict[str, list[float]] = {}
    rng = random.Random(7)
    for _ in range(200):  # many ticks — drift must stay bounded
        step_npcs(world, homes, rng)

    assert homes["n1"] == [10.0, 2.0, 10.0], "home anchors at the first-seen position"
    pos = world.npcs["n1"].position
    dist_from_home = math.sqrt((pos[0] - 10.0) ** 2 + (pos[2] - 10.0) ** 2)
    assert dist_from_home <= WANDER_RADIUS + 1e-9
    assert pos[1] == 2.0, "y untouched — clients resolve terrain height"


def test_far_npc_and_dead_npc_do_not_move() -> None:
    world = WorldState()
    _spawn(world, "far", [ACTIVE_RADIUS * 3, 0.0, 0.0])
    _spawn(world, "dead", [5.0, 0.0, 5.0], hp=0)
    player = world.get_player("p1")
    player.position = [0.0, 0.0, 0.0]

    rng = random.Random(1)
    for _ in range(50):
        updates = step_npcs(world, {}, rng)
        assert all(u["npcId"] not in ("far", "dead") for u in updates)

    assert world.npcs["far"].position == [ACTIVE_RADIUS * 3, 0.0, 0.0]
    assert world.npcs["dead"].position == [5.0, 0.0, 5.0]


def test_fixed_npc_never_moves() -> None:
    world = WorldState()
    npc = _spawn(world, "statue", [5.0, 0.0, 5.0])
    npc.fixed = True
    player = world.get_player("p1")
    player.position = [5.0, 0.0, 5.0]

    rng = random.Random(9)
    for _ in range(100):
        updates = step_npcs(world, {}, rng)
        assert all(u["npcId"] != "statue" for u in updates)

    assert world.npcs["statue"].position == [5.0, 0.0, 5.0]


def test_every_non_fixed_npc_moves_each_active_tick() -> None:
    # Only `fixed` makes an NPC static now — a non-fixed NPC moves every tick it
    # is active, even with wander_radius 0 (floored to MIN_WANDER_RADIUS).
    world = WorldState()
    _spawn(world, "a", [5.0, 0.0, 5.0])
    rooted = _spawn(world, "b", [6.0, 0.0, 6.0])
    rooted.wander_radius = 0
    player = world.get_player("p1")
    player.position = [5.0, 0.0, 5.0]

    rng = random.Random(11)
    moved = {"a": False, "b": False}
    for _ in range(5):
        for u in step_npcs(world, {}, rng, headings={}):
            moved[u["npcId"]] = True
    assert moved["a"] and moved["b"], "every active non-fixed NPC must move"


def test_summoned_npc_is_left_alone_until_suppression_expires() -> None:
    world = WorldState()
    npc = _spawn(world, "summoned", [5.0, 0.0, 5.0])
    npc.wander_suppressed_until = 100.0  # suppressed until t=100
    player = world.get_player("p1")
    player.position = [5.0, 0.0, 5.0]

    rng = random.Random(13)

    # Before expiry: never moves no matter how many ticks.
    for _ in range(50):
        updates = step_npcs(world, {}, rng, now=50.0)
        assert all(u["npcId"] != "summoned" for u in updates)
    assert world.npcs["summoned"].position == [5.0, 0.0, 5.0]

    # After expiry: free to wander again.
    moved = False
    for _ in range(50):
        if any(u["npcId"] == "summoned" for u in step_npcs(world, {}, rng, now=150.0)):
            moved = True
            break
    assert moved, "wandering resumes once suppression expires"


def test_per_npc_wander_radius_overrides_default() -> None:
    world = WorldState()
    npc = _spawn(world, "rover", [10.0, 0.0, 10.0])
    npc.wander_radius = 20.0  # wider than the default WANDER_RADIUS
    player = world.get_player("p1")
    player.position = [10.0, 0.0, 10.0]

    homes: dict[str, list[float]] = {}
    rng = random.Random(5)
    max_dist = 0.0
    for _ in range(400):
        step_npcs(world, homes, rng)
        pos = world.npcs["rover"].position
        max_dist = max(max_dist, math.sqrt((pos[0] - 10.0) ** 2 + (pos[2] - 10.0) ** 2))

    assert max_dist <= 20.0 + 1e-9
    assert max_dist > WANDER_RADIUS, "the wider per-NPC radius is actually used"


def test_updates_carry_npc_id_and_new_position() -> None:
    world = WorldState()
    # Far from the origin so the world's built-in starter NPCs stay inactive.
    _spawn(world, "n1", [1000.0, 0.0, 1000.0])
    player = world.get_player("p1")
    player.position = [1000.0, 0.0, 1000.0]

    rng = random.Random(3)
    updates: list[dict[str, Any]] = []
    for _ in range(20):
        updates.extend(step_npcs(world, {}, rng))
    assert updates, "an adjacent NPC must move within 20 ticks"
    for u in updates:
        assert u["npcId"] == "n1"
        assert len(u["position"]) == 3
    # The last reported position is the NPC's authoritative position.
    assert updates[-1]["position"] == world.npcs["n1"].position


# ── World geometry (landmark footprints) ────────────────────────────────────


def _footprint(cx: float, cz: float, half: float) -> Footprint:
    return Footprint(
        cx=cx,
        cz=cz,
        half_w=half,
        half_d=half,
        cos=1.0,
        sin=0.0,
        bound_sq=(half * 1.4143) ** 2,
    )


def test_footprint_contains_axis_aligned() -> None:
    fp = _footprint(0.0, 0.0, 2.0)
    assert fp.contains(0.0, 0.0)
    assert fp.contains(1.9, -1.9)
    assert not fp.contains(2.1, 0.0)
    assert not fp.contains(0.0, 5.0)


def test_footprint_contains_rotated() -> None:
    # 45° rotated square: a point off the unrotated corner is now outside.
    angle = math.pi / 4
    fp = Footprint(
        cx=0.0,
        cz=0.0,
        half_w=2.0,
        half_d=2.0,
        cos=math.cos(angle),
        sin=math.sin(angle),
        bound_sq=(2.83) ** 2,
    )
    assert fp.contains(0.0, 0.0)
    # Along the rotated local axis (diagonal in world space) still inside.
    assert fp.contains(1.3, 1.3)


def test_npc_never_steps_into_a_footprint() -> None:
    # A building sits right next to the NPC's home; over many ticks the NPC must
    # never land inside it.
    world = WorldState()
    _spawn(world, "n1", [1000.0, 0.0, 1000.0])
    player = world.get_player("p1")
    player.position = [1000.0, 0.0, 1000.0]
    geometry = WorldGeometry([_footprint(1004.0, 1000.0, 3.0)])

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    rng = random.Random(17)
    for _ in range(300):
        step_npcs(world, homes, rng, headings=headings, geometry=geometry)
        pos = world.npcs["n1"].position
        assert not geometry.is_blocked(pos[0], pos[2]), "NPC clipped into a footprint"


def test_geometry_does_not_freeze_npcs_in_the_open() -> None:
    # With a footprint that doesn't overlap the wander disc, movement is unaffected.
    world = WorldState()
    _spawn(world, "n1", [1000.0, 0.0, 1000.0])
    player = world.get_player("p1")
    player.position = [1000.0, 0.0, 1000.0]
    geometry = WorldGeometry([_footprint(1100.0, 1100.0, 3.0)])  # far away

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    rng = random.Random(19)
    moved = False
    for _ in range(20):
        if step_npcs(world, homes, rng, headings=headings, geometry=geometry):
            moved = True
    assert moved, "an NPC clear of all footprints must still wander"


def test_npc_authored_inside_a_footprint_still_roams() -> None:
    # NPCs are deliberately placed inside landmarks (Amphitheatre Manolos on stage,
    # merchants in a shop). The footprint is their home, not a wall — they must
    # keep moving, never freeze. Regression: enforcing geometry on them trapped
    # every such NPC and the world looked frozen.
    world = WorldState()
    big = _footprint(1000.0, 1000.0, 12.0)  # a 24m building
    _spawn(world, "shopkeeper", [1000.0, 4.0, 1000.0])  # home dead-center inside
    player = world.get_player("p1")
    player.position = [1000.0, 0.0, 1000.0]
    geometry = WorldGeometry([big])
    assert geometry.is_blocked(1000.0, 1000.0), "home must be inside the footprint"

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    rng = random.Random(21)
    moved = 0
    for _ in range(20):
        if step_npcs(world, homes, rng, headings=headings, geometry=geometry):
            moved += 1
    assert moved >= 15, "an NPC living inside a landmark must roam freely, not freeze"


def test_real_starter_npcs_keep_moving_with_geometry() -> None:
    # End-to-end on real data: a player at spawn, real manifest geometry, real
    # authored NPCs (incl. the Amphitheatre Manolos who live inside a footprint).
    # Every active non-fixed NPC must move — this is the "no NPC is moving" report.
    geometry = load_world_geometry()
    world = WorldState()
    player = world.get_player("p1")
    player.position = [0.0, 0.0, 0.0]
    active = [
        n.npc_id
        for n in world.npcs.values()
        if not n.fixed and n.hp > 0 and math.hypot(n.position[0], n.position[2]) <= ACTIVE_RADIUS
    ]
    assert active, "spawn area should have active NPCs"

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    rng = random.Random(1)
    moved: set[str] = set()
    for _ in range(10):
        for u in step_npcs(world, homes, rng, headings=headings, geometry=geometry):
            moved.add(u["npcId"])
    assert set(active) <= moved, f"frozen NPCs: {sorted(set(active) - moved)}"


def test_load_world_geometry_reads_manifest_landmarks() -> None:
    # Real manifest: Fort Malaka is a dense authored cluster — it must yield
    # footprints, and a known building's center must read as blocked.
    geometry = load_world_geometry()
    assert geometry.footprint_count > 0, "manifest landmarks should load"
    # malaka_broken_house_reconstructed center (see world_manifest fort_malaka).
    assert geometry.is_blocked(-178.4, -290.1)


def test_npcs_wander_fort_malaka_without_clipping_buildings() -> None:
    # The d012981 regression scenario, as a unit test: NPCs in the dense Fort
    # Malaka cluster, with real manifest footprints. Over many ticks none may
    # land inside a building, and they must still move (not freeze).
    geometry = load_world_geometry()
    world = WorldState()
    player = world.get_player("p1")
    player.position = [-160.0, 0.0, -270.0]  # inside the fort
    # Spawn a handful at clear spots around the fort plaza.
    spots = [
        [-160.0, 4.0, -270.0],
        [-150.0, 4.0, -260.0],
        [-170.0, 4.0, -280.0],
        [-155.0, 4.0, -285.0],
    ]
    for i, p in enumerate(spots):
        assert not geometry.is_blocked(p[0], p[2]), "test spot must start clear"
        _spawn(world, f"fort{i}", p)

    fort_ids = [f"fort{i}" for i in range(len(spots))]
    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    rng = random.Random(23)
    moved: set[str] = set()
    for _ in range(200):
        for u in step_npcs(world, homes, rng, headings=headings, geometry=geometry):
            moved.add(u["npcId"])
        for fid in fort_ids:
            pos = world.npcs[fid].position
            assert not geometry.is_blocked(pos[0], pos[2]), f"{fid} clipped a building"
    assert set(fort_ids) <= moved, "every fort NPC must still wander"
