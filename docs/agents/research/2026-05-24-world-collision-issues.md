---
date: "2026-05-24T22:36:33.337971+00:00"
git_commit: 8ec110ec202a88571db5b3d69c9fce98f858e63f
branch: refactor/architecture-docs
topic: "World collision failures and likely root causes"
tags: [research, collisions, client, world]
status: complete
---

# Research: World collision failures and likely root causes

## Research Question
What can be causing the current world collider problems, and where are those issues in code?

## Summary

The collision pipeline is spread across three major layers: collider registration (`main.ts`, `WorldGenerator.ts`), collision resolution/querying (`CollisionSystem.ts`), and movement consumers (`PlayerController.ts`, `NPC.ts`).  

The strongest failure candidates are:
1. Query/resolve mismatch (NPC checks use static-only obstacle grid, while player sweep uses static + dynamic bodies).
2. Dynamic collider culling radius mismatch (30m in collision sync vs larger entity visibility/update radii).
3. Collision failure suppression in player movement (exceptions are swallowed, movement continues).
4. Collider intent ambiguity for fallback mesh colliders (untagged mesh fallback can over-block if decorative meshes are not marked `noCollision`).
5. Coarse AABB collider approximation for rotated/complex meshes.

## Detailed Findings

### 1. Registration and lifecycle wiring

- Initial authored colliders are registered in `main.ts` via filtered group registration for buildings, Fort Malaka, and massive trees (`client/src/main.ts:303-312`).
- Dynamic NPC colliders are wired with `setDynamicSource(() => entityManager.getMeshes())` (`client/src/main.ts:314-316`).
- Procedural chunk content registers colliders on load and removes them on unload in `WorldGenerator` (`client/src/systems/WorldGenerator.ts:596-700`, `240-255`).

### 2. Core collision semantics

- Filtered registration now prefers explicit `isCollider`, otherwise falls back to all meshes not marked `noCollision` (`client/src/systems/CollisionSystem.ts:105-148`).
- Static body generation is AABB-based via `Box3.setFromObject` and converted into Cannon box bodies (`client/src/systems/CollisionSystem.ts:495-517`).
- Player movement resolution uses custom swept AABB with slide iteration and tests against collected static + dynamic bodies (`client/src/systems/CollisionSystem.ts:320-368`, `382-490`).

### 3. Static-only NPC blocking path

- `isPositionBlocked()` is used by NPC wander/path checks (`client/src/entities/NPC.ts:349-573`).
- `isPositionBlocked()` pulls from an obstacle grid built only from `this.statics` (`client/src/systems/CollisionSystem.ts:231-308`).
- Dynamic NPC bodies are not added to this grid path; they are only used in the sweep body list (`client/src/systems/CollisionSystem.ts:482-490`, `522-569`).

### 4. Dynamic collider culling window

- Dynamic NPC bodies are removed when farther than 30 units from player (`dx*dx + dz*dz > 900`) (`client/src/systems/CollisionSystem.ts:541-550`).
- Entity visibility/update ranges are much larger (`UPDATE_RADIUS_SQ = 200^2`, `VISIBLE_RADIUS_SQ = 350^2`) (`client/src/entities/EntityManager.ts:102-103`).
- This creates a range where NPCs can still be visible/active but no longer collision-active.

### 5. Player fallback on collision exceptions

- `PlayerController.update()` wraps `resolveMovement` in `try/catch`; on exception it keeps moved position and continues (`client/src/entities/PlayerController.ts:279-290`).
- This can present as intermittent clipping/ghosting whenever collision resolution throws.

### 6. Query shape tuning and edge behavior

- NPC blocking uses fixed `halfExtent`, vertical slab expansion (`minY = y - 0.6`, `maxY = y + halfExtent*5 + 0.6`) and `obstacleInset = 0.08` (`client/src/systems/CollisionSystem.ts:231-247`).
- Player sweep is horizontal only (XZ movement), with Y overlap gate but no vertical sweep (`client/src/systems/CollisionSystem.ts:423-425`).

## Code References

- `client/src/main.ts:299-317` - Collision system setup and dynamic source wiring.
- `client/src/systems/WorldGenerator.ts:240-255` - Collider cleanup on chunk unload.
- `client/src/systems/WorldGenerator.ts:596-700` - Cave/town collider registration.
- `client/src/systems/CollisionSystem.ts:105-148` - Filtered collider selection and fallback behavior.
- `client/src/systems/CollisionSystem.ts:231-308` - Static obstacle-grid path for `isPositionBlocked`.
- `client/src/systems/CollisionSystem.ts:320-490` - Swept AABB resolution and body collection.
- `client/src/systems/CollisionSystem.ts:495-517` - AABB-to-body conversion.
- `client/src/systems/CollisionSystem.ts:522-569` - Dynamic NPC body sync and 30m culling.
- `client/src/entities/PlayerController.ts:279-290` - Collision failure catch path.
- `client/src/entities/NPC.ts:349-573` - NPC movement/pathing collision usage.
- `client/src/entities/EntityManager.ts:102-127` - NPC visibility/update distance thresholds.

## Architecture Notes

- The system uses two different collision data paths:
  - Sweep path (player): static + dynamic bodies.
  - Block query path (NPC): static obstacle grid only.
- Collider registration is decentralized across authored scene constructors and procedural chunk spawn hooks.
- Collider intent depends on `isCollider`/`noCollision` conventions and fallback behavior in `addCollidableFiltered`.

## Open Questions

- None required for planning. Existing code paths are sufficient to define a complete implementation plan.
