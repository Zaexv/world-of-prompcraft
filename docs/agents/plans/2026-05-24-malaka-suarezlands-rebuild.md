---
date: 2026-05-24T21:42:27.142017+00:00
git_commit: 3ecf51c5038caef4f5194ec423edc56370412898
branch: refactor/architecture-docs
topic: "Fort Malaka + Blasted Suarezlands Rebuild and NPC Collision Reliability"
tags: [plan, client-scene, worldgen, collision, npc, server-world]
status: draft
---

# Fort Malaka + Blasted Suarezlands Rebuild and NPC Collision Reliability Implementation Plan

## Overview

Rebuild the Fort Malaka and Blasted Suarezlands visual composition with better material richness, cleaner layout, and safer spawn rules; move El Tito out of the mage tower; and implement a dedicated obstacle-query system to stop NPCs clipping through scene objects.

## Current State Analysis

Fort Malaka geometry is handcrafted in one scene module, but procedural tree spawning still ignores city footprints, which can place trees in fortress space. NPC wander currently depends on direct overlap checks that are improving but still too permissive in edge cases.

## Desired End State

Fort Malaka/Blasted Suarezlands should look deliberately authored (textured materials, coherent plazas/paths, cleaned vegetation placements), El Tito should spawn in a valid outdoor district location, and NPCs should use a stronger obstacle-calculation system that reliably blocks traversal through colliders.

### Key Discoveries:
- `client/src/systems/WorldGenerator.ts` tree spawning has no footprint exclusion check (`spawnTrees`, around `353+`).
- `client/src/scene/FortMalaka.ts` defines all city/mage district geometry and current object placement.
- `server/src/agents/personalities/templates.py` and `client/src/main.ts` both still place El Tito at `[5, 0, -120]` (inside tower footprint).
- `client/src/systems/CollisionSystem.ts` uses direct AABB checks in `isPositionBlocked` but has no dedicated spatial obstacle field for NPC query efficiency/reliability.

## What We're NOT Doing

- [ ] No server-side pathfinding service or navmesh generation.
- [ ] No new third-party texture asset pipeline.
- [ ] No quest logic rewrites beyond preserving El Tito accessibility after relocation.

## Implementation Approach

Refactor Fort Malaka composition with procedural textures and additional authored props, prevent procedural tree placement in authored city footprints, relocate El Tito on both server/client definitions, and add an obstacle-field subsystem in `CollisionSystem` used by NPC movement checks.

## Architecture and Code Reuse

- Reuse existing authored scene module: `client/src/scene/FortMalaka.ts`.
- Reuse footprint model (`{ x, z, radius }`) already used by vegetation avoidance.
- Reuse collision AABB sources (existing static body registration) and layer an indexed obstacle-field query.
- Reuse existing NPC wander flow (`NPC.updateWander`) and collision hook (`isPositionBlocked`) while strengthening internals.

```text
client/src/
  scene/
    FortMalaka.ts           # Rebuild area visuals/material richness/layout
    TerrainPlacement.ts     # Terrain anchoring/smoothing helpers
  systems/
    WorldGenerator.ts       # Tree spawn exclusion using city footprints
    CollisionSystem.ts      # New obstacle-field calculation/query layer
  entities/
    NPC.ts                  # Consume stronger obstacle queries for wander
  main.ts                   # El Tito fallback config + worldgen footprint wiring

server/src/
  agents/personalities/templates.py  # El Tito canonical position
```

## Phase 1: Visual Rebuild for Fort Malaka + Blasted Suarezlands

### Overview
Improve scene composition, material richness, and object placement quality for the full district.

### Changes Required:

#### [ ] 1. Fort Malaka material and layout pass
**File**: `client/src/scene/FortMalaka.ts`  
**Changes**: Add procedural texture materials (stone/stucco/arcane accents), rebuild key district sub-areas, and adjust problematic object placements (including fortress-adjacent tree conflicts).

#### [ ] 2. Terrain placement polish
**File**: `client/src/scene/TerrainPlacement.ts`  
**Changes**: Keep stable placement helpers and 10-iteration smoothing where needed for authored walkways/plazas.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd client && npx tsc --noEmit`
- [ ] Linting passes: `cd client && npx eslint src/`

#### Manual Verification:
- [ ] Fort Malaka and Blasted Suarezlands look cohesive with no obvious floating/block artifacts.
- [ ] Fortress region has no broken tree/object intrusion.

**Implementation Note**: Pause only after the phase if manual checks are needed.

---

## Phase 2: Spawn Safety + El Tito Relocation

### Overview
Ensure procedural systems respect authored city footprints and move El Tito out of tower space.

### Changes Required:

#### [ ] 1. Tree exclusion in authored city zones
**File**: `client/src/systems/WorldGenerator.ts`  
**Changes**: Add exclusion-footprint support and enforce it during tree spawn decisions.

#### [ ] 2. Wire footprint exclusions from main scene
**File**: `client/src/main.ts`  
**Changes**: Pass Fort Malaka/building footprints into `WorldGenerator` exclusion API.

#### [ ] 3. Move El Tito
**Files**: `server/src/agents/personalities/templates.py`, `client/src/main.ts`  
**Changes**: Update El Tito spawn coordinates to an outdoor Blasted Suarezlands location.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd client && npx tsc --noEmit`
- [ ] Linting passes: `cd client && npx eslint src/`
- [ ] Server checks (targeted): `cd server && python -m ruff check src`

#### Manual Verification:
- [ ] El Tito spawns outside the tower and remains interactable.
- [ ] No new random trees appear inside Fort Malaka authored structures.

**Implementation Note**: Continue automatically if only automated checks are needed.

---

## Phase 3: NPC Obstacle Calculation System

### Overview
Introduce a dedicated obstacle-field calculation/index in collision code and ensure NPC wandering uses it robustly.

### Changes Required:

#### [ ] 1. Add obstacle-field index
**File**: `client/src/systems/CollisionSystem.ts`  
**Changes**: Build/update a spatially indexed obstacle field from static colliders; query via `isPositionBlocked` using indexed candidates.

#### [ ] 2. Tighten NPC movement checks
**File**: `client/src/entities/NPC.ts`  
**Changes**: Use stronger path + obstacle checks to avoid clipping through objects while maintaining wander fluidity.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd client && npx tsc --noEmit`
- [ ] Linting passes: `cd client && npx eslint src/`
- [ ] Tests pass: `cd client && npm run test -- --run`

#### Manual Verification:
- [ ] NPCs no longer walk through walls/major static objects in Malaka/Suarezlands.
- [ ] NPC movement remains smooth without constant stuck jitter.

**Implementation Note**: Final phase includes user-facing behavior, so manual verification is recommended.

---

## Testing Strategy

### Unit Tests:
- [ ] Keep existing client unit tests passing for utilities/protocol/state.
- [ ] Validate no type/lint regressions in modified scene/collision code.

### Integration Tests:
- [ ] Launch client and verify Malaka/Suarezlands renders with updated scene composition.
- [ ] Verify NPC wandering respects colliders in rebuilt areas.

### Manual Testing Steps:
1. Start server/client and travel to Fort Malaka + Blasted Suarezlands.
2. Inspect fortress, promenade, mage district, and tree placements for visual quality and no intrusions.
3. Find El Tito and confirm he is outside the tower.
4. Observe NPCs near walls/buildings and confirm they do not pass through objects.

## Performance Considerations

- Obstacle-field indexing should reduce per-query broad scans versus checking every collider each NPC step.
- Material/texture additions use lightweight procedural `CanvasTexture` generation to avoid network asset load overhead.

## Migration Notes

- El Tito coordinate change is backward compatible for quest targeting by NPC ID.
- No schema/protocol migration required.

## References

- `client/src/scene/FortMalaka.ts`
- `client/src/systems/WorldGenerator.ts`
- `client/src/systems/CollisionSystem.ts`
- `client/src/entities/NPC.ts`
- `client/src/main.ts`
- `server/src/agents/personalities/templates.py`
