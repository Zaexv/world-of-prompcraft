# NPC Movement — Architecture Plan

**Date:** 2026-06-15
**Branch:** `feature/sync-npc-movement`
**Status:** ✅ DONE — Phases A (baseline) + B (server occupancy from authored
landmarks) shipped and verified. Summon-walk (click → NPC walks to you, no
teleport) and supporting persistence fixes (username, completed-quest names)
also shipped on this branch. The remaining nav work — making NPCs respect ALL
collisions (procedural trees/buildings/props) and route *around* them — is
carried forward into [2026-06-15_npc-collision-navigation-plan.md].

---

## 1. Goal (what the user asked for)

1. Non-fixed NPCs roam with **random, natural, per-NPC paths** — not all moving
   in lockstep, not pacing a tiny circle.
2. **Fixed** NPCs hold their authored position (rooftops, shopkeepers); the
   in-game authored NPCs stay quiet only if explicitly fixed.
3. NPCs can be placed **on top of buildings** and **respect collisions** (no
   walking through walls / collidable props).
4. Click an NPC → it **walks to the player**, unless it is fixed.
5. Movement is **server-authoritative** (every player sees each NPC in the same
   place).
6. Same controls exposed in **both** editors (WorldBuilderPanel + the terrain
   editor / NPC designer).

---

## 2. Where we are now (HEAD `fe1395c` — WORKING)

The shipped, working architecture is **"server steps positions, client
interpolates"**:

- **Server** (`server/src/world/npc_wander.py`): `npc_wander_loop` ticks every
  `TICK_SECONDS` (3s). `step_npcs` advances every *active* non-fixed NPC one
  bounded stroll step within its wander disc around home, persisting heading
  between ticks so motion reads as a path (per-style `MOVEMENT_PROFILES`). Gates:
  `hp>0`, not `fixed`, not summon-suppressed (`wander_suppressed_until`), and a
  player within `ACTIVE_RADIUS` (150m). Positions broadcast per-player as
  `npc_positions` (only NPCs near that player).
- **Client** (`NPC.followServerTarget` + `EntityManager` section 2): each
  visible server-driven NPC walks toward its latest server target every frame
  (netcode-style interpolation), resolving terrain/water Y locally, facing
  travel direction. `walkToServerPosition` records the target;
  `applyServerNPCPositions` teleports + re-grounds on large divergence (>25m:
  rejoin / long cull), else records the target.
- **Click / summon**: `walkToPlayer` → `walkToServerPosition` for instant local
  feedback; server `handle_npc_move` sets `wander_suppressed_until` so the wander
  loop leaves the NPC with the player for the conversation, then broadcasts.
- **Fixed flag**: NPC holds authored position — no wander, no walk-to-player, no
  ground snap (so it can sit on a rooftop). Threaded through
  `world_manifest.json` → `NPCData.fixed` → `NPC.fixed`.
- **Offline / presentation**: keeps the local `NPCWander` AI (collision-aware
  random/patrol wander) since there is no server.

**This is what the user approved as "works great."** It is the baseline. Any
refactor must beat it on the field or be reverted.

---

## 3. What we tried and reverted (the lesson)

### Commit `d012981` — "server owns roam intent, client navigates with collision"
(reverted by `fe1395c`)

**Idea (sound on paper):** split responsibilities cleanly — *server owns INTENT*
(assigns each NPC a roam **goal** within its radius on a staggered per-style
ETA+rest schedule), *client owns NAVIGATION* (it has the terrain + collision
data, so route the NPC to the goal through the collision-aware `NPCWander`,
deleting the `followServerTarget` "patch layer").

**Why it regressed:** the client's collision-aware navigator
(`pickTarget` / `walkTowardPoint` / `isPathBlocked`) **fails in dense town
geometry**. Near buildings almost every probed step is blocked, the detour
fan (±0.18rad × 10) can't escape, and NPCs got **stuck in towns**. Field
measurement: `noGoal:162, stuck:40, moved:5` → only **2/68 moved** vs **10/68**
with the simple interpolator. User: *"Now not a single NPC is moving."*

**Why the simple version wins today:** `followServerTarget` does **no collision
check** — it just walks toward the server's position. The server steps within a
wander disc that (mostly) avoids structures, so the NPC tracks fluently and
never gets wedged. The cost: an NPC *can* clip a wall if the server steps it
into one, because nothing on the path is collision-checked online.

### Key lessons
- **Working > architecturally pure.** The clean split was correct in shape but
  rested on a navigator that can't handle towns.
- **The regression was town-only.** NPCs got stuck *in dense clusters* (Malaka),
  not in open field. Open-field roam already works with the simple interpolator
  because procedural buildings are sparse. So the fix should target **towns**,
  where the colliders actually are — not the whole world.
- **Always measure on the field.** Both versions "looked right" in code; only the
  Playwright position-probe (`window.__wopNpcPositions`, `?nowarm` headless)
  showed moved/stuck counts and revealed the regression.
- **Don't hardcode; keep modular.** Per-style profiles + the `fixed`/
  `wander_radius`/`movement_style` data model stay; behaviour is data-driven.

---

## 4. Code reality (researched 2026-06-15 — grounds the plan)

What actually exists, with refs, because it changes the phasing:

**Client (owns all geometry today):**
- `CollisionSystem.ts` — `SpatialGrid` (32m cells) + per-mesh BVH + building
  pads. Query: `isPositionBlocked(x,y,z,halfExtent)` capsule (y→y+1.8, ~0.5m
  XZ). **No navmesh, no occupancy grid.**
- `Terrain.ts:549-556` `getHeightAt` = `computeHeight` (pure sin/cos multi-octave,
  **deterministic, no RNG**, `Terrain.ts:811-852`) + building pads + sculpt
  strokes. **Reproducible server-side** if ever needed.
- `ProceduralPopulator.ts` — per-chunk `SeededRng(chunkX, chunkZ, 0xdeadbeef)`
  (XORshift32). Buildings/trees/monsters placed deterministically per chunk, but
  **only at runtime, client-side**. ids like `proc_<id>_<cx>_<cz>_<i>`.
- `WorldGenerator.ts:78-93` — client reports **only NPCs** to the server
  (`explore_area` → `reportProceduralNpcs`). **No structure footprints sent.**

**Server (knows almost no geometry today):**
- `world_state.py` — tracks players, npcs, environment, player-built
  `world_objects`. **No structures, no terrain height.**
- `npc_wander.py step_npcs` — **zero collision/occupancy awareness** (confirmed).
- **`shared/data/world_manifest.json` is loaded server-side already**
  (`npc_definitions.py:22-66`) but it only reads `zones[*].population.npcs`. The
  same file ALSO contains **`zones[*].architecture.landmarks[*]`** with
  `{ position, scale, rotation, footprint: { shape, width, depth } }` — i.e. the
  authored-town footprints (Malaka etc.) **are already on disk, server-readable,
  just unused.**

**The pivotal fact:** the exact places NPCs got stuck (authored town clusters)
are exactly the places whose footprints the server can read for free from the
manifest. Procedural open-field buildings — which the server does *not* know —
are sparse and didn't cause the regression. So we can fix the real problem
cheaply and defer the hard part.

---

## 5. Target architecture (do it properly, but cheap-first)

Keep the server authoritative over **position**. Add geometry knowledge to the
server **where the colliders actually are** (towns, from the manifest), so the
simple client interpolator stops walking NPCs into walls. Only escalate to full
pathfinding if step-rejection proves insufficient.

### Phase A — Lock the baseline (DONE / current `fe1395c`)
Server steps positions, client interpolates with `followServerTarget`. Fixed,
suppression, per-style profiles, click-to-summon, both editors. **Shipped.**

### Phase B — Server occupancy from manifest landmarks (cheap, targets the regression) ✅ DONE
Implemented in `server/src/world/world_geometry.py` (loads 72 `rect` landmark
footprints from the manifest; point-in-rotated-rect test with NPC margin +
broad-phase reject) and wired into `npc_wander.py step_npcs` (reject step into a
footprint → probe `_DETOUR_OFFSETS` within the wander disc → hold + re-aim if
boxed in). `npc_wander_loop` loads geometry once at start. Unit-tested on the
real Fort Malaka fixture (the d012981 regression scenario) — NPCs wander the
fort without clipping buildings and still move. Original design below.

- Load `zones[*].architecture.landmarks` server-side (extend the existing
  `world_manifest.json` read in `npc_definitions.py` / hold in `WorldState`).
- Build a **footprint set** (rotated rect / circle per landmark from
  `footprint.{shape,width,depth}` + `position` + `rotation` + `scale`). Store as
  a coarse 2D blocked test — start with direct footprint hit-test (point-in-OBB),
  add a grid only if the per-step cost shows up.
- In `step_npcs`: reject a candidate step whose target lands in a footprint;
  re-pick heading inward (same shape as the existing wander-radius clamp at
  `npc_wander.py:135-139`). NPCs pace town edges instead of clipping through.
- Client stays the dumb interpolator (no client change). Multiplayer-consistent
  by construction (server is the only mover).
- **Test:** seed `step_npcs` over a Malaka fixture (real manifest footprints) →
  assert no NPC position lands inside a footprint over N ticks, and `moved ≫
  stuck`. This is the d012981 field test, now as a unit test.

### Phase C — Procedural-area occupancy (only if open-field clipping is reported)
Server doesn't know procedural building footprints. Two options if needed:
- *Option 1 (recommended):* extend the `explore_area` message so the client
  reports **structure footprints** alongside NPCs (it already builds them in
  `ProceduralPopulator`). Server merges them into the same footprint set as
  Phase B. Easy, no logic duplication, no drift.
- *Option 2 (reject unless forced):* replicate `SeededRng`+placement in Python.
  Deterministic but duplicates a lot of TS gen logic → drift risk. Avoid.
- Defer entirely until the town field test passes AND someone reports a real
  open-field clip. Sparse props rarely warrant it.

### Phase D — A* pathfinding (only if click-to-follow needs to route around towns)
Step-rejection (B) stops clipping for *roam* (small steps, turn-inward is fine).
It does **not** route an NPC *around* a building to reach a clicked player on the
far side. If that matters:
- A* over a nav-grid derived from the Phase B/C footprint set, **server-owned**
  (server already moves NPCs → one source of truth, no client/server drift).
- Re-introduce the **good half of d012981**: staggered roam goals + per-style
  ETA/rest schedule on top of A*, so NPCs walk real routes and don't move in
  lockstep.
- Gate to ACTIVE NPCs only (player within 150m); cache path per NPC; re-path on
  goal change or block. CPU is bounded by active count, not total NPCs.

### Phase E — Routines (cool behaviour, last)
Data-driven daily/area routines: waypoints with dwell times (market → home →
patrol), per-archetype, declared in manifest data (not code). Built on Phase D
pathing.

---

## 6. Verification protocol (every phase)

- **Unit:** seeded `step_npcs` over a real-manifest town fixture (Malaka) →
  assert no position inside a footprint; `moved ≫ stuck`. Deterministic, fast,
  no browser.
- **Field:** headless Playwright with `?nowarm` (skip glacial software-WebGL
  warmup). Probe `window.__wopNpcPositions` over ~10 ticks; metrics
  `moved / stuck / noGoal`; assert `moved ≫ stuck` **for NPCs inside towns**, not
  just open field.
- **Multiplayer:** two clients see the same NPC positions (server is sole mover).
- `make check` (lint + tsc + mypy + vitest + pytest) green before commit.

---

## 7. Risks / open questions

- **Manifest footprint fidelity.** `footprint.{shape,width,depth}` may not match
  the real mesh collider exactly (scale/rotation, multi-part buildings). Tune the
  footprint margin; accept coarse — goal is "don't walk through the fort," not
  pixel-perfect.
- **Procedural occupancy gap.** Until Phase C, server is blind to procedural
  buildings; an NPC *can* still clip a runtime-spawned hut in open field. Accept
  as known until reported (the regression was towns, not field).
- **Terrain Y stays client-side.** Server steps XZ only; client resolves height
  (`getHeightAt`) + water hover. No need to port terrain math unless A* needs
  slope/walkability — defer.
- **Fixed-on-rooftop.** Keep `fixed` fully exempt from occupancy + ground snap so
  authored Y (rooftops) survives.
- **Don't regress the baseline.** Every phase lands behind the working
  interpolator; if a phase measures worse on the town fixture, revert it — the
  same discipline that caught d012981.

---

## 8. TL;DR

Current state works (server steps, client interpolates — `fe1395c`). d012981 was
right in shape but failed because the client navigator can't handle towns.
**Research finding:** the stuck-NPCs were in authored towns, and those towns'
footprints are *already in `world_manifest.json`, server-readable, unused.* So:
**(B)** load manifest landmark footprints server-side and reject wander steps
that enter them — cheap, no client change, kills town-clipping at the source;
**(C)** report procedural footprints via `explore_area` only if open-field clips
get reported; **(D)** A*-route (server-owned) + staggered goals only if
click-to-follow needs to go *around* buildings; **(E)** routines last. Unit-test
on a real Malaka fixture every phase; never regress the working baseline.
