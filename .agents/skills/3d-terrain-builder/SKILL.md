---
name: 3d-terrain-builder
description: Build, debug, and optimize procedural 3D terrain in Promptcraft. Use when fixing terrain seams/gaps, clipping, LOD artifacts, chunk streaming issues, mountain generation, and player-ground physics consistency.
argument-hint: [goal, e.g. "remove terrain seams on zone transitions" or "add mountains without performance regressions"]
---

# 3D Terrain Builder (Promptcraft)

You are working on Promptcraft terrain quality, consistency, and performance.

## Core Files

- `client/src/scene/Terrain.ts` — chunk loading, mesh generation, height function, normals/colors
- `client/src/entities/PlayerController.ts` — grounded/falling behavior and terrain-follow movement
- `client/src/scene/SceneManager.ts` — rendering/perf context

## Rules That Prevent Terrain Artifacts

1. **No visible chunk seams**
   - Prefer a single chunk subdivision density unless you implement explicit edge stitching.
   - If LOD is mixed, never leave T-junction borders unstitched.

2. **Deterministic world-space normals**
   - Avoid `computeVertexNormals()` per chunk when seams are visible.
   - Reconstruct normals from world-space height derivatives (central differences), so neighboring chunks shade identically at borders.

3. **Chunk streaming must be center-prioritized**
   - On player chunk change, rebuild queue and prioritize nearest chunks first.
   - Use burst loading on transitions to avoid temporary holes when changing zones.

4. **Terrain function must be smooth and bounded**
   - Keep mountain terms continuous and avoid spike-prone exponent chains.
   - Use distance masks to increase relief away from central gameplay areas.
   - Keep compute cost reasonable: avoid unnecessary `sqrt/hypot` in hot loops when squared distance works.

5. **Player-ground physics should feel game-like**
   - Do not hard-snap to ground on large downward deltas.
   - Use a small snap threshold for micro-steps and trigger free-fall off cliffs.

## Implementation Checklist

1. Inspect terrain gaps source:
   - Geometry cracks (LOD/T-junction)
   - Shading seams (normal mismatch)
   - Streaming holes (queue order/throughput)
2. Apply fixes in this order:
   - Geometry continuity
   - Normal continuity
   - Streaming prioritization
   - Height function smoothing/perf
3. Validate with:
   - Zone transition movement tests
   - Cliff/mountain traversal
   - Client checks (`eslint`, `tsc --noEmit`, `vitest`)

## Promptcraft-Specific Best Practices

- Keep terrain deterministic through `Terrain.computeHeight(x, z)` everywhere.
- Reuse chunk material and typed arrays; avoid per-frame allocations in hot paths.
- Tune chunk throughput conservatively and burst only on transition events.
- Preserve visual style while improving continuity first; consistency beats extra detail.

## User Request

The user wants: **$ARGUMENTS**

Implement the terrain changes with no visible seams and stable runtime performance.
