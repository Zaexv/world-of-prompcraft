---
date: 2026-06-10
branch: main
topic: "World Improvement — Biome Separation, Map UI, Teleport Fix"
tags: [plan, biomes, zones, world-map, minimap, teleport, ui]
status: done (Phases 1-3 + volcanic; Phase 4 deferred)
---

## Outcome (2026-06-10)

Implemented & verified (`make check` green: 162 client + 260 server tests, tsc/eslint/ruff/mypy clean):
- **Phase 1** — Zones rewritten as a radial partition (locale discs + center + biome
  sectors) in both `ZoneTracker.ts` and `zones.py`; new `test_no_overlap_partition`
  proves zero overlap. `Biomes.ts` exports `BIOME_ZONE_NAMES`.
- **Phase 2** — `Minimap`: removed overlapping rectangle overlays → engraved per-region
  labels at sector centroids; warm parchment fringe; distinct portal teleport markers.
- **Phase 3** — `WorldGenerator` filters waypoints to a teleport whitelist (+ metadata
  flag), emits `kind:'teleport'` with `safeRadius`; `GameBootstrapper` offsets arrival
  clear of the footprint so the player no longer lands inside meshes.
- **Volcanic Blasted Suarezlands** (user follow-up) — new modular `Volcano` building +
  `LavaPool` prop registered via `BIOME_BUILDINGS`/`BIOME_PROPS`; dramatic volcanic
  terrain height + stronger lava emissive in `Biomes.ts`.
- **Phase 4** (landmark relocation) — deferred: authored content, lower risk left for a
  focused pass.

## Iteration 2 (2026-06-10)

- **World-map teleport bug fixed** — `Minimap.getWaypointAtCanvasPoint` was always
  projecting with the local-mode scale/center, so clicks in world mode never hit a
  marker. Now branches on `viewMode` using the same projection the view draws with.
- **Biomes separated further** — `directionalWeight` halfWidth 0.50π → 0.20π (36°) in
  both `Biomes.ts` and `zones.py`, so a band of neutral Teldrassil forest now sits
  between neighbouring biomes (modular, single tunable constant each side).
- **Renamed** central hub `Elders' Village` → `Makaleta Strande` across every zone-name
  key (ZoneTracker, zones.py, music, atmosphere, ZoneDisplay, Minimap, tests).
- **Volcano mesh rebuilt** — was a sharp cone with a wide rim floating at the apex; now
  stacked truncated cones with a correctly seated crater, molten core, slope-following
  lava ribbons, basalt spatter vents, ash plume. Verified to build via meshSmoke test.
- **Modularity** — teleport destination types extracted to `systems/TeleportRegistry.ts`
  (`registerTeleportType`/`isTeleportType`); `fireParticles` made headless-safe.
- All green: `make check` exit 0 (164 client + 260 server tests).

## Iteration 3 (2026-06-10)

- **Map lag fixed** — world map redrew the whole overlay every frame. Now the static
  layer (biomes, labels, locale rings, waypoints, vignette, compass) is baked once into
  an offscreen canvas and blitted per frame; only the player beacon + NPC dots draw live.
  Cache invalidates on pan/zoom/waypoint/hover. Verified in a real browser (Playwright):
  per-frame `update()` 13.1 ms → 0.014 ms, 0 rebakes while moving.
- **Lava is now part of the terrain** — deleted the `LavaPool` prop mesh; added
  `Biomes.lavaField(x,z)` blended into terrain color + emissive so glowing lava pools/veins
  are baked into the ground (shared field keeps color/glow aligned).

## Iteration 4 (2026-06-10)

- **Tests added**: `ZoneTracker.test.ts` (radial partition, locale-disc non-overlap,
  onZoneChange/forceZone), `TeleportRegistry.test.ts` (whitelist, modular register,
  `safeArrivalXZ`), `Biomes.test.ts` (sector directions, weight normalization, forest
  buffer between biomes, `lavaField` range/threshold/determinism). +`biome_volcano` in
  meshSmoke. Client 170 tests.
- **`safeArrivalXZ` extracted** from GameBootstrapper into `TeleportRegistry` (pure,
  tested).
- Diagonal forest wedges between biomes are **intentional** (the requested separation) —
  a reviewer flagged them as "dead zones"; they are valid Teldrassil Wilds buffer, asserted
  by tests, and never overlap another zone.
- `make check` exit 0 (170 client + 260 server).

# World Improvement Plan — Biomes, Map UI, Teleport

## Problem Statement (from user)

1. **Biomes overlap.** Moin Swamps, Fort Malaka & other biomes occupy the same
   space. World map looks messy. Biomes should be clearly separated by space and
   distance and never overlap.
2. **Map UI is PoC-quality.** Functional but ugly. Needs a real fantasy-map look.
3. **Teleport is buggy.** Teleports the player *inside* meshes. Need to define
   which items are teleportable vs not, and teleport targets must be visible and
   actionable on the world map.

## Root-Cause Analysis

There are **three uncoordinated sources of truth** for "where biomes/zones are":

| Source | Model | Notes |
|--------|-------|-------|
| `client/src/scene/Biomes.ts` | Radial center disc + 5 angular sectors (N/E/S/SW/NW), blended by `getBiomeWeights`. | `getDominantBiome` already yields a **clean non-overlapping** angular partition. Drives terrain color/height. |
| `server/src/world/zones.py` + `client/src/systems/ZoneTracker.ts` | **Overlapping rectangles** resolved by area-priority sort. | "Teldrassil Wilds" catch-all spans the entire ±400 box → overlaps every inner zone. "Ember Peaks" and "Blasted Suarezlands" both sit east. This is the overlap the user sees. |
| `world_map.png` (static art) | Hand-painted: Halmogia N, Tanis Desert NW, Moin Swamps NE, Costa de la Luz W, Blasted Suarezlands S, Fort Malaka SE. | A concept render — not what the live procedural map shows. |

The **map overlay** (`Minimap._drawZoneOverlays`) draws these overlapping
rectangles as translucent boxes → visually muddy, labels stacked.

**Teleport**: `WorldGenerator.syncMinimapWaypoints` turns *every* landmark with a
`visual.label` into a clickable waypoint — including palm trees, grass props,
lanterns, market stalls. `onWaypointClick` (GameBootstrapper.ts:161) teleports to
the landmark's own `(x,z)` at ground height → the player materializes **inside**
the building mesh. No notion of "teleportable".

Additional data issue: several landmarks are mis-placed across biomes (e.g.
`mage_tower` at `(460,100)`, `malaka_broken_castle` at `z=-380` inside
`twilight_marsh`), reinforcing the "everything overlaps" impression.

## Design Decisions

### Canonical world layout (single source of truth)

Collapse zones onto the **radial biome model** that already drives terrain. A zone
is derived, not a rectangle:

```
getZone(x, z):
  dist = hypot(x, z)
  for disc in LOCALE_DISCS:          # named inner locales, must not overlap
     if hypot(x-disc.x, z-disc.z) < disc.r: return disc.name
  if dist < CENTER_RADIUS: return "Elders' Village"   # central disc
  return SECTOR_NAME[ dominantBiomeSector(angle) ]      # outer ring
```

- **Outer ring sectors** = the 5 biome sectors (Crystal Tundra N, Blasted
  Suarezlands E, Moin Swamps S, Malaka Area SW, Tanis Desert NW). Argmax over the
  directional weights is a clean partition (boundaries at sector midpoints) → **zero overlap by construction**.
- **Locale discs**: `Elders' Village` (center, r≈90) and `Fort Malaka` (SW pocket
  around (-200,-250), r≈120). Non-overlapping, checked first.
- Drops the legacy overlapping rectangles (Ember Peaks, Crystal Lake, Dark Forest,
  Suarez Quarter, Teldrassil Wilds catch-all). Names now match the terrain biome
  the player is standing on — consistent and clean.

Server (`zones.py`) and client (`ZoneTracker.ts`) replicate the **same** formula.
The angular sector math mirrors `Biomes.directionalWeight` targets.

### Map UI

- Remove translucent overlapping rectangles.
- Keep the pre-rendered biome color raster (already a clean partition).
- Draw **one label per biome region** at its sector centroid + locale-disc labels.
- Parchment/fantasy styling: warm vignette frame, compass rose, scale ring,
  legend, serif (Cinzel) labels with halo. Crisper biome edges.
- Distinct **teleport markers** (rune/portal icon) for travel points only.

### Teleport

- Introduce `kind: 'teleport'` waypoints. A landmark is teleportable iff its type
  is in a curated whitelist (towns/wells/moonwells, shrines/altars, towers, major
  ruins, campfires-as-camps) **or** it sets `visual.metadata.teleportable: true`.
  Props (palm trees, grass, lanterns, market stalls, fences) are filtered out.
- **Safe arrival**: arrive *outside* the mesh footprint. Compute footprint radius
  from `FOOTPRINT_SPECS` / `visual.metadata.footprint`, offset the target by
  `footprintRadius + margin` along the direction toward world origin, then sample
  terrain height there. Falls back to the raw point if no footprint known.
- Teleport markers rendered distinctly and clickable on the world map (existing
  click path reused).

## Phases

### Phase 1 — Unify zone model (no overlap) ✅ core
- `client/src/scene/Biomes.ts`: export `dominantBiomeSector(angle)` /
  reuse existing sector math; export sector→zone-name + centroid table.
- `client/src/systems/ZoneTracker.ts`: replace `ZONES` rectangle scan with the
  radial `getZone` (locale discs + center + sectors). Keep `ZoneData`/exports used
  by the map (now describing sectors/discs, not overlapping rects).
- `server/src/world/zones.py`: mirror the radial `get_zone`. Keep zone
  descriptions.
- Update `server/tests/domains/world/test_zones.py` to the new partition.

### Phase 2 — Map UI overhaul
- `client/src/ui/Minimap.ts`: drop `_drawZoneOverlays` rectangles; add
  `_drawRegionLabels` (sector centroids + locale discs); parchment frame, compass,
  scale ring, legend; crisper styling; distinct teleport markers.

### Phase 3 — Teleport whitelist + safe arrival
- `client/src/systems/WorldGenerator.ts`: filter `syncMinimapWaypoints` to
  teleportable landmarks; emit `kind: 'teleport'`; carry footprint info.
- `client/src/ui/Minimap.ts`: support/`render` `'teleport'` waypoint kind.
- `client/src/core/GameBootstrapper.ts`: `onWaypointClick` computes safe arrival
  offset outside footprint before setting position.

### Phase 4 (optional follow-up) — Landmark relocation
- Audit `shared/data/world_manifest.json` for landmarks sitting in the wrong
  biome sector and relocate (e.g. stray `mage_tower`, marsh-bound Malaka ruins).
  Deferred: pure data curation, lower risk to leave for a focused pass.

## Verification
- `make typecheck` (tsc + mypy) and `make test` (vitest + pytest) green.
- Manual: open map (M), confirm clean non-overlapping regions + labels; click a
  teleport marker and confirm arrival is beside, not inside, the structure.

## What we're NOT doing
- Replacing the procedural world with the static `world_map.png`.
- Fog-of-war / exploration tracking.
- Reworking terrain height/color generation (already clean).
