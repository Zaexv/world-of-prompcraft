# NPC Collision-Aware Navigation — Plan

**Date:** 2026-06-15
**Branch:** `feature/sync-npc-movement`
**Status:** DRAFT — design only, not implemented.
**Predecessor:** [2026-06-15_DONE_npc-movement-plan.md] (Phases A+B shipped:
baseline server wander + occupancy from *authored* landmark footprints).

---

## 1. Goal

NPCs respect **all** collisions when moving — procedural trees, procedural
buildings, props — not only authored landmarks. Two distinct behaviours:

- **Avoid** — a roaming NPC never steps *into* a collider (it currently can,
  for anything the server doesn't know about).
- **Route around** — a moving NPC (especially a summoned one walking to the
  player) goes *around* an obstacle to reach its target, instead of stopping at
  the wall.

Constraint (carried from the predecessor, user-stated): movement stays
**server-authoritative** so every player sees the same positions. No client-only
navigation that can diverge between clients.

---

## 2. Code reality (researched 2026-06-15)

**The collision picture lives on the CLIENT:**
- `CollisionSystem.isPositionBlocked(x,y,z,halfExtent)` (`CollisionSystem.ts:274`)
  covers trees, procedural buildings, props, authored meshes — via a `SpatialGrid`
  (32 m cells) + per-mesh BVH. ~0.1–0.5 ms/query. Available at runtime
  (`EntityManager.update` param, `GameEngine` dep).
- Procedural placement is deterministic per chunk
  (`ProceduralPopulator.ts`, `SeededRng(chunkX,chunkZ,0xdeadbeef)`), registered
  collidable as it spawns.

**The SERVER knows almost nothing:**
- `npc_wander.py step_npcs` consults `world_geometry.py`, which today loads only
  **authored landmark footprints** from `world_manifest.json`.
- Procedural structure footprints are **never reported** to the server
  (`WorldGenerator.ts:79,91` sends NPCs via `explore_area`, not structures;
  `ProceduralPopulator.setExclusionFootprints` is a stub).
- `NPC.followServerTarget` (`NPC.ts:174`) walks toward the server target with
  **no collision check**. `step_summon` likewise walks straight.

**No pathfinding exists** anywhere (no A*, navmesh, flow-field). The reverted
`d012981` tried client-side greedy detour (`NPCWander` probe-and-retarget) and
froze in dense clusters — greedy detour has no global path, hits local minima.

**Scale:** chunk 64 m; `ACTIVE_RADIUS` 150 m (server), client update 120 m; a
~150 m active disc ≈ 25 chunks × ~10–16 colliders ≈ **300–400 footprints**
active at once; ≤ ~10 active NPCs near a player; wander tick 3 s. Low enough that
per-tick footprint tests over the active set are cheap — **a full per-NPC nav
grid rebuilt at runtime is NOT** (~1.4 M cells over the disc; seconds to build).

---

## 3. Decision

**Server-authoritative occupancy, fed by client-reported footprints.** The
client already owns the geometry and reports NPCs; it reports **footprints** the
same way. The server merges them into the existing `WorldGeometry` and reuses the
proven step-rejection (Phase B) and, later, adds routing. This keeps one mover
(server) → multiplayer-consistent by construction, and avoids the client-side-A*
divergence trap.

Rejected:
- **Client-side A* steering toward server targets** — two clients pathfind
  differently → NPC positions drift. Violates the authority constraint.
- **Replicating procedural gen in Python** — duplicates a large TS system, drift
  risk. The client already has the footprints; just send them.
- **Runtime per-NPC nav grids** — too expensive to build/invalidate on chunk
  load.

---

## 4. Phases

### Phase C — Report procedural footprints → server avoids ALL static colliders
Make roaming NPCs stop clipping anything (not just landmarks).

- **Client:** when a chunk is populated, collect the footprints of its collidable
  objects (center x/z, half-extents, rotation y) — `ProceduralPopulator` already
  knows them at spawn (it builds the colliders). Batch-report via the existing
  `explore_area` channel (extend the message with `structures: [{x,z,hw,hd,rot}]`)
  or a sibling `report_structures` message. De-dup by a chunk key so re-entering
  a chunk doesn't re-send.
- **Server:** `world_geometry.py` gains a dynamic footprint set keyed by chunk,
  merged with the manifest landmarks behind the same `is_blocked(x,z)` API.
  `step_npcs` and `step_summon` already (or will) call it — no stepping-logic
  change for roam. Add an `is_blocked` check to `step_summon` so summoned NPCs
  also reject blocked steps.
- **Scale:** bucket footprints by chunk; test only the NPC's chunk + 8 neighbours
  (not all 400). Add this spatial bucketing to `WorldGeometry` (today it is a
  linear scan — fine for 72 landmarks, not for 400+).
- **Keep:** the "home inside footprint" exemption (an NPC authored inside a
  structure roams it freely — already shipped).
- **Test:** seeded `step_npcs` over a fixture with reported procedural footprints
  → no NPC lands inside one; NPCs not homed in a footprint still move. Field:
  Playwright `?nowarm`, probe positions in a tree-dense chunk, assert no clip.

**Outcome:** NPCs **avoid** all known colliders. They still don't **route
around** them (they reject + turn, which is fine for roam, not for "walk to me
across a wall").

### Phase D — Server-side routing (go *around* obstacles to a target)
For summoned NPCs (and any goal-directed move) that must reach a point on the far
side of an obstacle.

- **Algorithm:** A* (or greedy-with-memory if A* proves heavy) over a **coarse
  grid derived on demand from the merged footprint set**, not from per-cell
  collision queries — cells blocked iff their center is inside a footprint.
  Resolution ~1–2 m; bounded to a small window around the NPC→target segment, not
  the whole disc.
- **Owner:** server. It already moves NPCs; it streams the stepped path positions;
  client keeps the dumb interpolator (`followServerTarget`) — every step < 25 m so
  no teleport, and all observers see the same route.
- **Gate:** compute a path only for NPCs with an active goal (summon target) and
  only when a straight step is blocked; cache the path; re-path on goal change or
  when blocked. Active NPCs only (≤ ~10) → CPU bounded.
- **Replaces:** `step_summon`'s straight-line walk with "advance along the cached
  path." Roam can stay reject-and-turn (cheap) or also adopt short paths.
- **Test:** unit — NPC summoned across an L-shaped wall fixture reaches the target
  (path length finite, never enters a blocked cell). Field — summon an NPC with a
  building between you and it; it walks around, not into, the building.

### Phase E — Tuning & polish
- Footprint margin per collider class (thin tree vs fort) so NPCs don't over-avoid.
- Optional: smooth the path (string-pulling) so routes look natural, not grid-y.
- Decide tree policy: hard-avoid all, or treat thin trunks as soft (cheaper, NPCs
  may brush them). Default: avoid, revisit if it feels twitchy.

---

## 5. Risks / open questions

- **Footprint volume / bandwidth.** 300–400 active footprints. Report per chunk,
  de-dup by chunk key, send once on first populate. Bucket server-side by chunk.
  Watch the `explore_area` payload size; split if needed.
- **Procedural determinism vs report timing.** Footprints exist only after the
  client populates a chunk. An NPC could clip a collider in a chunk no client has
  populated yet — acceptable (no one is watching it) and self-corrects once
  reported.
- **A* CPU.** Bounded by active NPCs (≤ ~10) and on-demand/cached paths. If it
  still bites, fall back to greedy-with-memory (breadcrumb backtrack) before a
  full navmesh.
- **Grid coarseness near tight gaps.** A 1–2 m grid may close a real 1.5 m alley.
  Tune resolution per need; most game-relevant gaps are wider.
- **Don't regress.** Land Phase C behind the working baseline; measure clip/stuck
  on a town + tree fixture; revert any phase that measures worse — the discipline
  that caught `d012981`.
- **`fixed` NPCs** stay fully exempt from occupancy + nav.

---

## 6. TL;DR

Collision data lives on the client; movement must stay server-authoritative. So
the client **reports footprints** (it already reports NPCs) and the server merges
them into the existing `WorldGeometry`. **Phase C:** report procedural collider
footprints → server step-rejection makes NPCs *avoid* all colliders (chunk-bucketed
for scale; summon gets the same check). **Phase D:** server-side A* over a coarse
on-demand grid from those footprints, gated to active goal-directed NPCs, streamed
as bounded steps → NPCs *route around* obstacles to reach a target (e.g. a summon
across a wall). **Phase E:** tuning. Avoid client-side A* (divergence) and runtime
per-NPC nav grids (too costly). Test on town + tree fixtures every phase; never
regress the working baseline.
