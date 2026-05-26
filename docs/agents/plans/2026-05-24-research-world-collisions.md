---
date: 2026-05-24T22:36:54.860840+00:00
git_commit: 8ec110ec202a88571db5b3d69c9fce98f858e63f
branch: refactor/architecture-docs
topic: "World Collision Reliability Recovery"
tags: [plan, collisions, client, world, npc]
status: draft
---

# World Collision Reliability Recovery Implementation Plan

## Overview

Stabilize world collisions so player movement, NPC navigation, and procedural/authored geometry use consistent and reliable blocking behavior with clear collider intent.

## Current State Analysis

- Collider registration is centralized in `main.ts` for authored content and `WorldGenerator` for streamed content (`client/src/main.ts:303-316`, `client/src/systems/WorldGenerator.ts:596-700`).
- `CollisionSystem` uses filtered registration with tag preference and mesh fallback (`client/src/systems/CollisionSystem.ts:105-148`).
- Player collision resolution uses swept AABB over static + dynamic bodies (`client/src/systems/CollisionSystem.ts:320-490`).
- NPC path checks use `isPositionBlocked`, which reads from a static-only obstacle grid (`client/src/systems/CollisionSystem.ts:231-308`, `client/src/entities/NPC.ts:349-573`).
- Dynamic NPC colliders are distance-culled at 30 units (`client/src/systems/CollisionSystem.ts:541-550`), while entities remain visible/updated at larger radii (`client/src/entities/EntityManager.ts:102-127`).
- Player collision exceptions are swallowed in `PlayerController` (`client/src/entities/PlayerController.ts:279-290`).

## Desired End State

- Collision behavior is predictable across all world geometry (authored + procedural).
- Player and NPC systems use collision data that does not contradict each other in common gameplay ranges.
- Dynamic NPC collider activation range is consistent with entity visibility/update behavior.
- Collider intent is explicit (`isCollider` for blocking, `noCollision` for decorative).
- No silent player movement fallback on collision-system exceptions.

### Key Discoveries:

- `isPositionBlocked` and `resolveMovement` currently consume different obstacle sets (`client/src/systems/CollisionSystem.ts:231-308`, `320-490`).
- Dynamic collider culling currently undercuts active entity ranges (`client/src/systems/CollisionSystem.ts:541-550`, `client/src/entities/EntityManager.ts:102-127`).
- Procedural lifecycle already has a clean hook surface for register/unregister, so behavior changes can stay localized (`client/src/systems/WorldGenerator.ts:240-255`, `596-700`).

## What We're NOT Doing

- We are not changing server networking or authoritative movement architecture.
- We are not replacing AABB collisions with full mesh-level physics.
- We are not redesigning terrain generation, biome logic, or zone boundaries.
- We are not adding new gameplay features; this is reliability hardening only.

## Implementation Approach

Apply a phased hardening pass:
1. Align collision data paths and radii.
2. Enforce explicit collider intent in high-impact mesh groups.
3. Remove silent failure paths and add verification coverage.

## Architecture and Code Reuse

- Reuse existing `CollisionSystem` APIs (`addCollidableFiltered`, `removeCollidable`, `setDynamicSource`) and extend behavior in-place.
- Reuse existing scene registration flow in `main.ts` and chunk lifecycle in `WorldGenerator`.
- Reuse existing NPC pathing hooks in `NPC.ts` (no new movement subsystem).

```text
client/src/
  systems/
    CollisionSystem.ts        # unify obstacle sources, tune dynamic range, reliability guards
    WorldGenerator.ts         # enforce collider intent on spawned structures where needed
  entities/
    PlayerController.ts       # remove silent collision fallback path
    NPC.ts                    # keep collision usage aligned with updated obstacle semantics
  scene/
    Caves.ts                  # ensure clear isCollider/noCollision intent (if gaps remain)
    Towns.ts                  # ensure clear isCollider/noCollision intent (if gaps remain)
    Buildings.ts              # targeted tag audit for major blockers/decor
    FortMalaka.ts             # targeted tag audit for major blockers/decor
  __tests__/
    NPCMotion.test.ts         # extend movement/pathing collision behavior coverage
    Boats.test.ts             # regression guard where collider behavior intersects traversal
```

## Phase 1: Align collision data model and runtime ranges

### Overview

Make player and NPC collision consumers rely on coherent obstacle sets and activation windows.

### Changes Required:

#### [ ] 1. Unify obstacle-source semantics for NPC block queries
**File**: `client/src/systems/CollisionSystem.ts`  
**Changes**:
- Add an explicit strategy for whether `isPositionBlocked` should include dynamic bodies.
- Ensure this strategy is consistent with `resolveMovement` body collection.
- Keep computational cost bounded (candidate filtering remains required).

```ts
isPositionBlocked(x, y, z, halfExtent, includeDynamic = true): boolean
```

#### [ ] 2. Align dynamic collider culling with entity activity ranges
**File**: `client/src/systems/CollisionSystem.ts`  
**Changes**:
- Replace hardcoded `30^2` dynamic-cull threshold with constants aligned to entity visibility/update design.
- Keep culling configurable and clearly documented.

#### [ ] 3. Verify call-site behavior remains consistent
**Files**: `client/src/main.ts`, `client/src/entities/NPC.ts`  
**Changes**:
- Ensure the updated collision query semantics are used intentionally at each caller.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd client && npx tsc --noEmit`
- [ ] Client tests pass: `cd client && npx vitest run`

#### Manual Verification:
- [ ] Nearby NPCs and visible NPCs do not phase through each other or static blockers unexpectedly.
- [ ] Player collision remains stable when moving through dense NPC areas.

**Implementation Note**: Pause after Phase 1 for quick gameplay validation because collision semantics will visibly change.

---

## Phase 2: Complete collider intent audit for high-impact world meshes

### Overview

Ensure blocking vs decorative geometry is explicitly tagged in the main authored/procedural structures.

### Changes Required:

#### [ ] 1. Audit authored structures for explicit collider intent
**Files**: `client/src/scene/Buildings.ts`, `client/src/scene/FortMalaka.ts`  
**Changes**:
- Add/adjust `userData.isCollider` for truly blocking meshes.
- Add `userData.noCollision` for decorative meshes that should not block despite fallback mesh registration.

#### [ ] 2. Audit procedural structures for explicit collider intent
**Files**: `client/src/scene/Caves.ts`, `client/src/scene/Towns.ts`, `client/src/systems/WorldGenerator.ts`  
**Changes**:
- Verify cave/town generated meshes have consistent intent tags.
- Confirm streamed objects registered via `addCollidableFiltered` produce expected bodies only.

#### [ ] 3. Keep unload cleanup paired with registration strategy
**File**: `client/src/systems/WorldGenerator.ts`  
**Changes**:
- Ensure removal paths correctly remove descendant filtered colliders for all spawned groups.

### Success Criteria:

#### Automated Verification:
- [ ] Lint/check passes: `cd client && npx eslint src/scene src/systems`
- [ ] Type checking passes: `cd client && npx tsc --noEmit`

#### Manual Verification:
- [ ] Player cannot walk through key structural meshes.
- [ ] Decorative-only meshes do not create invisible blockers.
- [ ] Streamed caves/towns remain collidable after chunk load and non-blocking after unload.

**Implementation Note**: Continue to next phase once mesh-intent behavior is confirmed in at least one authored zone and one streamed zone.

---

## Phase 3: Remove silent collision failure paths and add safeguards

### Overview

Eliminate success-shaped fallback behavior that hides collision failures during runtime.

### Changes Required:

#### [ ] 1. Replace broad catch-and-ignore in player movement
**File**: `client/src/entities/PlayerController.ts`  
**Changes**:
- Remove silent collision exception swallow.
- Surface errors in a way consistent with project logging patterns while preserving loop stability.

#### [ ] 2. Add targeted runtime guards in collision system
**File**: `client/src/systems/CollisionSystem.ts`  
**Changes**:
- Harden edge-case handling where invalid AABBs or empty candidates can occur.
- Keep failure modes explicit and diagnosable.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd client && npx tsc --noEmit`
- [ ] Client tests pass: `cd client && npx vitest run`

#### Manual Verification:
- [ ] No intermittent “ghost-through” behavior caused by hidden collision errors.
- [ ] Collision failures, if they occur, are observable and actionable in logs.

**Implementation Note**: Do not stop for confirmation if all checks and manual behavior are clean.

---

## Phase 4: Regression coverage and full-stack validation

### Overview

Add/update tests and run full repository checks so collision hardening is protected from regressions.

### Changes Required:

#### [ ] 1. Add targeted test coverage for collision-critical paths
**Files**: `client/src/__tests__/NPCMotion.test.ts` (and additional focused collision tests as needed)  
**Changes**:
- Add assertions covering blocked-path behavior and retargeting expectations tied to `isPositionBlocked`.

#### [ ] 2. Run full project verification
**File**: n/a  
**Changes**:
- Execute existing project checks to validate no regressions.

### Success Criteria:

#### Automated Verification:
- [ ] Full checks pass: `cd /Users/eduardo.pertierrapuche/Development/My Project/world-of-prompcraft && make check`

#### Manual Verification:
- [ ] Traverse authored zones and streamed chunks; collision feels consistent and game-like across regions.
- [ ] NPCs navigate around blockers without obvious stalls or clipping.

**Implementation Note**: This is the release-readiness phase; stop after this phase for final user sign-off.

## Testing Strategy

### Unit Tests:
- Validate collision query behavior around static-only vs dynamic-included candidates.
- Validate NPC path blocking and retarget behavior when direct paths are obstructed.
- Validate filtered collider registration only blocks intended meshes.

### Integration Tests:
- Player movement through authored cities + procedural towns/caves with active NPC population.
- Chunk load/unload cycles with repeated collider register/remove operations.

### Manual Testing Steps:
1. Start both server and client; move through Elders' Village, Fort Malaka, and at least one streamed town/cave chunk.
2. Attempt traversal through known structural geometry and decorative geometry to validate blocker intent.
3. Observe NPCs in dense areas and during chunk transitions; confirm they avoid blockers and do not clip.
4. Repeat with camera close to geometry to ensure movement and camera collisions remain stable.

## Performance Considerations

- Any dynamic-in-query expansion must stay spatially filtered to avoid per-frame brute-force scans.
- Collider-tag audits should favor explicit intent over adding excessive colliders to decorative detail meshes.
- Dynamic-collider radius changes must balance correctness and runtime overhead.

## Migration Notes

- No data migration required (client runtime behavior only).
- Existing save/state formats remain unchanged.

## References

- `docs/agents/research/2026-05-24-world-collision-issues.md`
- `client/src/systems/CollisionSystem.ts:105-148`
- `client/src/systems/CollisionSystem.ts:231-308`
- `client/src/systems/CollisionSystem.ts:320-490`
- `client/src/systems/CollisionSystem.ts:522-569`
- `client/src/entities/PlayerController.ts:279-290`
- `client/src/entities/NPC.ts:349-573`
- `client/src/systems/WorldGenerator.ts:240-255`
- `client/src/systems/WorldGenerator.ts:596-700`
- `client/src/main.ts:303-316`
