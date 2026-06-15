# NPC Pathfinding (grid A*) — Implementation Plan

**Date:** 2026-06-15
**Branch:** `feature/sync-npc-movement`
**Status:** DRAFT — implementation build sheet, not yet started.
**Design parent:** [2026-06-15_npc-collision-navigation-plan.md] (Tier 1 = grid
A*, server-authoritative). This doc is the concrete, file-level how.

Goal: a moving NPC (summoned, or any goal-directed move) **routes around**
obstacles to reach its target instead of stopping at / clipping through them.
Server-authoritative; client unchanged (keeps the dumb interpolator). Pure
Python, no new deps.

---

## 0. What already exists (reuse, don't rebuild)

- `server/src/world/world_geometry.py` — `WorldGeometry` + `Footprint`
  (`contains`, broad-phase), `is_blocked(x,z)`, `load_world_geometry()`. Loads
  72 authored landmark footprints. **This is the obstacle source.**
- `server/src/world/npc_wander.py` — `step_npcs` (wander + reject-and-turn around
  footprints), `step_summon` (straight-line walk to `summon_target`), constants
  `SUMMON_STEP=6.0`, `SUMMON_ARRIVE=2.5`. `npc_wander_loop` loads geometry once.
- `server/src/world/world_state.py` — `NPCData` with transient `summon_target`.
- `server/src/ws/handlers/movement.py` — `handle_npc_move` sets `summon_target` +
  steps once.

The only genuinely new code is **A* + a windowed grid + path-follow**. Everything
else is wiring into the above.

---

## Milestone 1 — Towns-only routing (authored landmarks)  ≈ 3 days

Route around the dense authored clusters (Fort Malaka, Teldrassil) — the places
NPCs actually get trapped. Uses footprints already loaded; **no client protocol
work**. Procedural trees remain clippable (sparse; deferred to M2).

### Task 1.1 — `WorldGeometry`: query footprints in a bbox  (0.5d)
`world_geometry.py`:
```python
def footprints_in_bounds(self, min_x, min_z, max_x, max_z) -> list[Footprint]: ...
def is_blocked_bounds(...)  # optional helper
def nearest_free(self, x, z, *, cell, max_rings=8) -> tuple[float, float]: ...
```
- `footprints_in_bounds`: filter by AABB overlap (cx±bound vs bounds). Linear over
  72 is fine now; add the chunk bucket in M2 when count grows to ~400.
- `nearest_free`: ring-search outward for an unblocked point (used to snap a
  start/goal that sits inside a footprint to a walkable cell).
- Tests: bounds filter returns only overlapping footprints; `nearest_free`
  returns the point itself when already clear, a near point when boxed.

### Task 1.2 — New module `npc_navigation.py`: windowed grid A*  (1d)
```python
# server/src/world/npc_navigation.py
CELL = 1.5            # grid resolution (m). Gaps narrower than this won't path.
PAD = 8.0            # window padding around the start↔goal segment (m)
MAX_CELLS = 4096     # safety cap; bail to straight-line if the window is huge

def find_path(
    start: tuple[float, float],
    goal: tuple[float, float],
    geometry: WorldGeometry,
) -> list[tuple[float, float]] | None:
    """A* on a grid covering the start↔goal bbox (+PAD). Cells blocked iff their
    center is inside a footprint. Returns world-space waypoints (start excluded,
    goal last), or None if no path / window too large (caller falls back to a
    straight line)."""
```
- Build only the bbox window (NOT the whole active disc) → cell count bounded by
  the move distance, not the world.
- 8-connected A*, octile heuristic, diagonal cost √2. Block diagonal corner-cuts
  (don't slip between two diagonally-adjacent blocked cells).
- Snap blocked start/goal via `geometry.nearest_free` before searching.
- **String-pull / line-of-sight smoothing** pass at the end: drop waypoints the
  NPC can walk to directly (no blocked cell on the segment) so paths look natural,
  not staircase-y. Keep it simple (greedy LOS skip).
- Tests (pure, no world): straight clear path → ~1 waypoint (the goal, after
  smoothing); single wall → detours; L-wall → reaches goal, no waypoint inside a
  footprint; enclosed goal → None; oversized window → None.

### Task 1.3 — Path state on `NPCData` + path-follow in `step_summon`  (1d)
`world_state.py` — add transient fields:
```python
nav_path: list[list[float]] | None = None   # remaining waypoints (x, z)
nav_path_goal: list[float] | None = None     # goal the path was computed for
```
`npc_wander.py` — rework `step_summon(npc, geometry)`:
- Recompute the path when: no `nav_path`, OR `summon_target` moved
  > `REPATH_DIST` (e.g. 3 m) from `nav_path_goal` (player walked), OR path emptied.
- If `find_path` returns a path → store it; advance toward the first waypoint by
  `SUMMON_STEP`; pop it on arrival.
- If `find_path` returns None (clear straight shot or window too big) → current
  straight-line behaviour (unchanged).
- Arrival within `SUMMON_ARRIVE` of the final goal → clear `summon_target` +
  `nav_path`.
- **Keep the home-inside-footprint exemption mindset:** if the summon goal is
  inside a footprint (player standing in a building), `nearest_free` snaps it —
  the NPC stops at the doorway rather than failing.
- `step_summon` now takes `geometry`; pass it from `step_npcs` and from
  `handle_npc_move` (the loop already has geometry; the handler must load/access
  it — see 1.4).

### Task 1.4 — Wire geometry into the summon handler  (0.25d)
`movement.py handle_npc_move` calls `step_summon(npc)` today with no geometry.
Give it access:
- Simplest: a module-level lazily-loaded `get_world_geometry()` singleton in
  `world_geometry.py` (load once, reuse) so both the loop and the handler share
  one instance. Refactor `npc_wander_loop` to use it too.

### Task 1.5 — Tests + field verify  (0.5d)
- Unit: `npc_navigation` (1.2) + a `step_summon` integration on a real Fort
  Malaka fixture — summon an NPC from one side of a building to a target on the
  other; assert it reaches the goal and never occupies a blocked cell.
- **Real-data guard (lesson from this session):** load real geometry + real
  starter NPCs, summon one across the Malaka cluster, assert it arrives and no
  active NPC freezes. Mirror `test_real_starter_npcs_keep_moving_with_geometry`.
- Field: Playwright `?nowarm`, stand on the far side of the fort, click an NPC →
  it walks around the building, not into it. Probe `window.__wopNpcPositions`.

### M1 acceptance
- Summoned NPC routes around authored buildings to reach the player.
- No regression: roamers still wander (reject-and-turn), no NPC freezes, full
  suite green (`make check`).

---

## Milestone 2 — Procedural colliders (trees/buildings/props)  ≈ 2 days

Server learns the colliders it currently can't see, so routing + avoidance cover
the whole world, not just authored towns. (This is Phase C of the design plan.)

### Task 2.1 — Client reports per-chunk footprints  (0.75d)
- `ProceduralPopulator.ts`: at chunk populate, collect each collidable object's
  footprint (center x/z, half-extents, rot_y) — it already builds the colliders;
  derive AABB/OBB from the bounds. Fill the existing `setExclusionFootprints`
  stub or a new collector.
- `WorldGenerator.ts`: report them to the server (mirror `reportProceduralNpcs`),
  de-duped by chunk key so re-entry doesn't resend.

### Task 2.2 — Protocol + server ingest  (0.5d)
- `MessageProtocol` (client) + `movement.py` (server): extend `explore_area` with
  `structures: [{x, z, hw, hd, rot}]` (or a sibling `report_structures` message).
- Server merges into `WorldGeometry` as a **dynamic, chunk-keyed** footprint set
  behind the same `is_blocked` / `footprints_in_bounds` API.

### Task 2.3 — Scale: chunk-bucket `WorldGeometry`  (0.5d)
- With ~400 active footprints, bucket by chunk; `footprints_in_bounds` /
  `is_blocked` test only the relevant buckets. Add to 1.1's API.

### Task 2.4 — Tests  (0.25d)
- Reported procedural footprints block stepping + appear in paths.
- Re-entering a chunk doesn't duplicate footprints.

### M2 acceptance
- NPCs avoid + route around procedural trees/buildings too. Field: summon across
  a tree-dense chunk → walks around trunks.

---

## Optional Milestone 3 — Roam uses short paths + polish  (later)

- Let `step_npcs` roam pick A* paths for short hops near clutter (currently
  reject-and-turn). Only if roam-clipping is reported; reject-and-turn is cheap
  and usually fine.
- Per-collider margin (thin tree vs fort). Path-smoothing tuning. NPC-NPC spacing
  is out of scope (would need a steering/RVO layer — separate effort).

---

## Cross-cutting

**Performance budget.** A* runs only for goal-directed (summoned) NPCs — ≤ ~10
active — and only when a straight step is blocked; path is cached and re-used
until the goal moves. Window grid is bounded by move distance, capped at
`MAX_CELLS`. Worst case a handful of small A* searches per 3 s tick. Negligible.

**Authority / multiplayer.** Server computes + drives the path; positions stream
as bounded steps (< 25 m) → client renders via `followServerTarget`, no teleport,
all observers identical. No client pathfinding → no divergence.

**Rollout / safety.** Gate M1 behind a settings flag
(`settings.npc_pathfinding_enabled`, default on) so it can be killed instantly if
it misbehaves in play — the same revert-fast discipline that caught `d012981`.
Each milestone lands behind the working baseline; if a fixture measures more
freezes/clips than before, revert that milestone.

**Test discipline (hard-won this session).** Every milestone MUST include a test
on **real manifest geometry + real starter NPCs**, not just synthetic fixtures —
twice this session a change passed synthetic tests but froze NPCs in-game because
authored NPCs live inside footprints / near clusters. See
[[feedback-npc-movement-real-data]].

---

## File touch list

| File | M1 | M2 |
|---|---|---|
| `server/src/world/world_geometry.py` | bbox query, nearest_free, geometry singleton | dynamic chunk-keyed set + buckets |
| `server/src/world/npc_navigation.py` (new) | A* + windowed grid + smoothing | — |
| `server/src/world/npc_wander.py` | path-follow `step_summon`, pass geometry | — |
| `server/src/world/world_state.py` | `nav_path`, `nav_path_goal` on NPCData | — |
| `server/src/ws/handlers/movement.py` | geometry into `handle_npc_move` | ingest `structures` |
| `server/src/config.py` | `npc_pathfinding_enabled` flag | — |
| `client/src/systems/ProceduralPopulator.ts` | — | collect footprints |
| `client/src/systems/WorldGenerator.ts` | — | report footprints |
| `client/src/network/MessageProtocol.ts` | — | `structures` field |
| tests (server + Playwright) | nav unit + real-data summon | procedural footprints |

---

## TL;DR

The algorithm is small; reuse `WorldGeometry` as the obstacle source. **M1
(~3d):** new `npc_navigation.py` with windowed grid A* + LOS smoothing; store a
path on `NPCData`; make `step_summon` follow it (fall back to straight-line when
clear); wire geometry into the summon handler. Result: summoned NPCs route around
authored buildings, server-authoritative, no client change. **M2 (~2d):** client
reports procedural footprints so routing covers trees/props too; chunk-bucket the
geometry for scale. Flag-gated, real-data-tested, revert-fast per milestone.
