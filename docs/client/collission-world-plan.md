# Collision & World-Builder Rework Plan

> **Goals**
> 1. **Collision that works perfectly** — players should walk *over* small objects, slide along walls at the correct contact surface, and never clip through any geometry. Collision must conform to the actual 3D mesh, not approximate bounding boxes.
> 2. **A world fully extensible by prompting and images** — type a sentence or paste a screenshot, and the world updates in real time.

---

## 1. Executive Summary

| System | Current state | Target state |
|---|---|---|
| **CollisionSystem** | Cannon-es AABB wrapper, no debug view, rotated objects oversized, no step/slope detection, Y=0 only | Per-triangle mesh collision via BVH, capsule character controller, step-over, slope sliding, debug overlay |
| **WorldBuilder** | 14 hardcoded objects, no persistence, text-only, Y=0 bugs | 40+ quality objects, persistence, vision input, blueprint pipeline, streaming agentic build |

---

## 2. Current-State Diagnosis

### 2.1 Collision System Root Causes

| # | Problem | Symptom |
|---|---|---|
| C1 | All colliders are axis-aligned AABBs. Rotated geometry gets an oversized box. | Player stops 2–3 m before touching a diagonal wall or arch |
| C2 | `obstacleGrid` rebuilt from scratch on every dirty flag. | Stutter on chunk load |
| C3 | Cannon-es imported only for struct storage — physics step never runs. ≈40 KB dead weight. | Bundle bloat |
| C4 | `setFromObject` recurses into all descendants; one building = hundreds of bodies. | Slow broad-phase |
| C5 | AABBs computed once; animated or moved objects leave ghost colliders. | Clips through moving parts |
| C6 | No debug overlay. | Impossible to diagnose visually |
| C7 | No vertical collision — no floor/ceiling/overhang test. | Player passes through bridge soffits |
| C8 | NPC dynamic bodies recreated every tick. | CPU overhead in NPC-dense zones |
| C9 | No step detection. A 0.3 m kerb stops the player dead. | Cannot walk over low objects |
| C10 | No slope limit. Player can walk vertically up a cliff face. | Exploitable movement |
| C11 | No capsule representation for player. Box corners catch on geometry seams. | Jittery corner navigation |

### 2.2 WorldBuilder Root Causes

| # | Problem | Symptom |
|---|---|---|
| W1 | 14 object types, plain geometry, no biome-aware coloring. | Placed objects look out of place |
| W2 | No persistence. Dies on refresh. | Every session starts blank |
| W3 | Server sends Y=0 for all placements. | Objects placed underground |
| W4 | No image/vision input. | Cannot "build from screenshot" |
| W5 | Agent knows only player XZ, no zone/nearby context. | Agent places towers in the sea |
| W6 | No blueprint system. Building a village takes N separate prompts. | Low-throughput workflow |
| W7 | No undo. | Destructive by default |
| W8 | No streaming. 2–6 s blank wait before anything appears. | Feels unresponsive |
| W9 | No history. No way to reference previously placed objects. | Workflow friction |
| W10 | Vision pipeline absent. | Cannot analyse images |

---

## 3. Phase 1 — Perfect Mesh-Accurate Collision

This is the most technically complex and most important phase. The goal is a character controller that behaves like a AAA game: walks over curbs, slides along walls, stops at the correct mesh surface, cannot clip through any geometry.

### 3.1 Foundational Library: `three-mesh-bvh`

The standard way to achieve per-triangle collision in Three.js is **`three-mesh-bvh`** by gkjohnson.  It pre-computes a Bounding Volume Hierarchy directly into a `BufferGeometry`, then exposes O(log n) triangle queries: raycasts, sphere casts, capsule casts, and shape intersections.

```
npm install three-mesh-bvh
```

Core concept:

```ts
import { MeshBVH, acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';

// Monkey-patch Three.js to use BVH raycasts
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Pre-compute BVH for a mesh (done once at load/spawn time)
mesh.geometry.computeBoundsTree();
```

After BVH construction, `MeshBVH` provides:
- `shapecast(capsule, ...)` — sweep a volume against every triangle, returns contacts
- `raycastFirst(ray)` — O(log n) raycast to nearest triangle
- `intersectsBox(box)` — fast AABB overlap test

This replaces all of Cannon-es.

### 3.2 Removing Cannon-es

Cannon-es is deleted entirely. All types it provided (`Body`, `Box`, `World`, `Vec3`) are replaced with plain TypeScript structs:

```ts
// client/src/systems/collision/types.ts

export interface AABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

/** An OBB (Oriented Bounding Box) — for rotated objects. */
export interface OBB {
  center: THREE.Vector3;
  halfExtents: THREE.Vector3;
  /** Column-major rotation matrix (the 3 local axes in world space). */
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** World-space AABB of this OBB — used for broad-phase. */
  worldAABB: AABB;
}

/** A collidable body associated with a Three.js scene object. */
export interface CollisionBody {
  id: number;
  source: THREE.Object3D;
  /** True when source has a MeshBVH — enables triangle-accurate narrow phase. */
  hasBVH: boolean;
  /** Fastest broad-phase bound. Always present. */
  aabb: AABB;
  /** Present when source has rotation — tighter than pure AABB. */
  obb?: OBB;
  /** MeshBVH instance (from three-mesh-bvh) — present for mesh-level accuracy. */
  bvh?: MeshBVH;
  /** World matrix at build time — used to detect stale bodies. */
  buildMatrix: THREE.Matrix4;
  isDynamic: boolean;
}

export interface ContactPoint {
  /** Point on the surface in world space. */
  point: THREE.Vector3;
  /** Surface normal pointing away from the collider (into the player). */
  normal: THREE.Vector3;
  /** How much the player is penetrating (positive = penetrating). */
  depth: number;
}
```

---

### 3.3 Player Representation: Capsule Collider

A **capsule** (cylinder capped with hemispheres) is the industry-standard character shape. It has two critical advantages over a box:

1. **Corner-free** — slides around geometry seams instead of catching.
2. **Natural step-up** — the bottom hemisphere naturally rides up over low obstacles.

```
         ╭────╮
        │      │   ← top hemisphere, radius r
        │      │
        │      │   ← cylinder body, height (capsuleHeight - 2r)
        │      │
        ╰────╯   ← bottom hemisphere, radius r

  Total height: capsuleHeight = 1.8 m  (player)
  Radius:       r = 0.35 m
  Top center:   playerPos + (0, capsuleHeight - r, 0)
  Bottom center: playerPos + (0, r, 0)
```

Defined as:
```ts
// client/src/systems/collision/Capsule.ts
export interface Capsule {
  start: THREE.Vector3;  // bottom sphere center
  end:   THREE.Vector3;  // top sphere center
  radius: number;
}

export function capsuleFromPlayerPos(pos: THREE.Vector3, r: number, h: number): Capsule {
  return {
    start: new THREE.Vector3(pos.x, pos.y + r,     pos.z),
    end:   new THREE.Vector3(pos.x, pos.y + h - r, pos.z),
    radius: r,
  };
}
```

`three-mesh-bvh` provides `capsuleIntersectMesh(capsule, mesh)` — returns all contacts in one call.

---

### 3.4 The Triangle-Level Narrow Phase

After the BVH broad-phase identifies which meshes could be touching the capsule, the narrow phase tests every triangle in the BVH that overlaps the capsule AABB:

```
For each candidate CollisionBody whose worldAABB overlaps capsule AABB:
  │
  ├── hasBVH = true:
  │     Use bvh.shapecast(capsuleShape) → list of ContactPoints
  │     Each contact has: point, normal, depth
  │
  └── hasBVH = false (fallback for simple/generated geometry):
        Use OBB SAT test (15 separating axes) → one ContactPoint (box face normal)
```

The triangle-level contact generation algorithm:

```
FOR each triangle T in BVH candidates:
  1. Find the closest point P on triangle T to the capsule axis (line segment start→end)
  2. dist = |P - closest_point_on_segment|
  3. IF dist < capsule.radius:
       depth    = capsule.radius - dist
       normal   = normalize(closest_on_segment - P)
       contact  = P + normal * capsule.radius   // surface contact point
       PUSH ContactPoint { point: contact, normal, depth }
```

This gives us:
- Exact surface point (not a box face approximation)
- Exact normal (the actual mesh surface normal at that triangle)
- Penetration depth

---

### 3.5 Kinematic Character Controller — Full Algorithm

The controller runs every frame and produces a new player position from `currentPos + desiredVelocity * dt`.

```
INPUT:  currentPos, desiredVelocity (from input), dt, verticalVelocity (gravity state)
OUTPUT: resolvedPos, isGrounded, isCeiling

─────────────────────────────────────────────────────────────
STEP 1 — GRAVITY
  if not isGrounded:
    verticalVelocity -= GRAVITY * dt           // ≈ 9.8 m/s²
  else:
    verticalVelocity = max(verticalVelocity, 0)
  desiredVelocity.y = verticalVelocity

─────────────────────────────────────────────────────────────
STEP 2 — SWEPT MOVEMENT (up to 4 depenetration iterations)

  pos = currentPos
  vel = desiredVelocity * dt

  FOR iter = 0..3:
    IF |vel| < 0.0001: BREAK

    capsule = capsuleFromPos(pos)

    contacts = collectContacts(capsule)    ← BVH + OBB narrow phase

    IF contacts is empty:
      pos += vel
      BREAK

    // Find the deepest contact (most important to resolve first)
    c = contacts.max_by(depth)

    // Depenetrate: push player out of the surface
    pos += c.normal * c.depth

    // Project velocity onto contact surface (wall-slide)
    vel = vel - dot(vel, c.normal) * c.normal

    // Re-check contacts after depenetration
    continue

─────────────────────────────────────────────────────────────
STEP 3 — CLASSIFY CONTACTS

  isGrounded = any contact where normal.y > cos(MAX_SLOPE_ANGLE)
               e.g. MAX_SLOPE_ANGLE = 46°  → cos = 0.694
  isCeiling  = any contact where normal.y < -0.1

  If isGrounded:
    verticalVelocity = 0

─────────────────────────────────────────────────────────────
STEP 4 — GROUND SNAP (prevents floating over small dips)

  Cast a short ray down from pos:
    ray origin: pos + (0, capsule.radius, 0)
    ray dir: (0, -1, 0)
    max distance: SNAP_DISTANCE = 0.25 m

  If hit AND hitNormal.y > 0.694 (walkable slope):
    pos.y -= hit.distance - capsule.radius    ← stick to ground

─────────────────────────────────────────────────────────────
STEP 5 — STEP DETECTION (walk over low obstacles)

  If not isGrounded AND |horizontal velocity| > 0.01:

    Cast a ray forward+down:
      origin: pos + forward * (capsule.radius + 0.05) + (0, MAX_STEP_HEIGHT, 0)
      dir: (0, -1, 0)
      max dist: MAX_STEP_HEIGHT = 0.5 m

    If hit AND hitNormal.y > 0.694:
      stepHeight = MAX_STEP_HEIGHT - hit.distance
      pos.y += stepHeight      ← lift player over the step

─────────────────────────────────────────────────────────────
OUTPUT: pos, isGrounded, isCeiling
```

### 3.6 Slope Handling

A slope is **walkable** if its normal Y component exceeds `cos(maxSlopeAngle)`:

```
maxSlopeAngle = 46°
cos(46°) ≈ 0.694

IF contactNormal.y > 0.694:  → floor/ramp (walk on it, Y velocity zeroed)
IF contactNormal.y < -0.1:   → ceiling (vertical movement cancelled)
IF contactNormal.y ∈ [-0.1, 0.694]:  → wall (project horizontal velocity, slide)
```

On steep slopes, velocity is projected onto the slope normal to produce a **slide-down** effect:

```
slideVelocity = gravity * (1 - normal.y) * dt   // steeper = faster slide
slideDir = normalize(normal.xz projected onto horizontal plane)
pos += slideDir * slideVelocity
```

This prevents the player from climbing un-walkable faces and makes slopes feel physically correct.

### 3.7 Step Detection in Detail

Step detection allows the player to walk over:
- Low kerbs (< 0.5 m)
- Shallow stairs (riser < 0.5 m per step)  
- Rubble / debris (small physics props)

The algorithm uses **two probes**:

```
PROBE A — "Is there something blocking me at current height?"
  Cast a sphere forward at capsule.start height
  If blocked AND blockNormal.y < 0.694 (it's a wall, not a slope):
    candidate for step-up

PROBE B — "Is there a floor above the obstacle?"  
  Cast a ray from (pos.x + forward * stepCastDist, pos.y + MAX_STEP_HEIGHT, pos.z)
  downward, max distance = MAX_STEP_HEIGHT

  If B hits AND hitPoint.y > pos.y:            ← there IS a floor above
    stepHeight = hitPoint.y - pos.y
    If stepHeight < MAX_STEP_HEIGHT:
      pos.y += stepHeight + 0.01              ← lift player onto step
      isGrounded = true                       ← immediately ground-snap after
```

This two-probe design ensures the player only steps up when there is a valid floor above the obstacle, not when the obstacle is a full wall.

### 3.8 BVH Construction Pipeline

BVH computation is expensive but done once per mesh. The pipeline:

```
AT SCENE LOAD / STRUCTURE SPAWN:

  For each THREE.Mesh in a registered object:
    1. mesh.geometry.computeBoundsTree({ strategy: SAH })
       // SAH (Surface Area Heuristic) = better for complex geometry
       // Takes ~5 ms for a 2000-triangle mesh (run in microtask/setTimeout)

    2. bvh = mesh.geometry.boundsTree   // stored MeshBVH

    3. Build CollisionBody {
         source: mesh,
         hasBVH: true,
         bvh: bvh,
         aabb: computeWorldAABB(mesh),
         buildMatrix: mesh.matrixWorld.clone(),
       }

    4. Register body with CollisionSystem

  For non-mesh objects (Groups, procedural markers):
    → Fall back to OBB / AABB (no BVH)
```

**Async BVH construction** for large meshes:
```ts
async function registerMeshWithBVH(mesh: THREE.Mesh, system: CollisionSystem): Promise<void> {
  // Yield to rendering before expensive BVH build
  await new Promise(r => setTimeout(r, 0));
  mesh.geometry.computeBoundsTree({ strategy: SAH });
  system.addCollisionBody(mesh);
}
```

### 3.9 Stale Body Detection

Bodies become stale when their source object moves (animations, dynamic placement). The `CollisionSystem` checks this automatically each frame for dynamic bodies:

```ts
private refreshDynamicBodies(): void {
  for (const body of this.dynamicBodies.values()) {
    if (!body.source.matrixWorld.equals(body.buildMatrix)) {
      // Object moved — recompute AABB / OBB from new world matrix
      this.rebuildBody(body);
    }
  }
}
```

Static bodies (buildings, terrain) are never auto-refreshed for performance.  
They must be explicitly removed and re-added if their world transform changes.

### 3.10 Terrain Collision: Heightmap Fast Path

The terrain (infinite chunk-based procedural) has a special case: it is **always convex upward** and queried mathematically (no mesh triangles needed). This is much faster than BVH:

```
TERRAIN HEIGHT QUERY (O(1)):
  terrainY = terrain.getHeightAt(x, z)   // pure math, no mesh

  if playerPos.y < terrainY + capsule.radius:
    // Player is in the ground — snap up
    playerPos.y = terrainY + capsule.radius
    verticalVelocity = max(0, verticalVelocity)
    isGrounded = true
```

The terrain is never registered as a BVH body — only authored structures (buildings, WorldBuilder objects, dungeon walls) go through the full BVH pipeline.

### 3.11 Collision Proxy Meshes (Authoring Pattern)

For complex authored structures, the visual mesh may have too many triangles for efficient BVH collision (e.g., the Grand Mage Tower has ~8000 triangles). The solution is to author a **collision proxy** — a simplified invisible mesh that wraps the visual geometry:

```
Visual mesh:      8000 triangles (detailed arches, ornaments, filigree)
Collision proxy:   120 triangles (simplified box-shell with open arch gaps)
```

Convention used in the codebase:
```ts
// Visual mesh — no collision
mesh.userData.noCollision = true;

// Collision proxy — BVH registered, not rendered
proxy.visible = false;
proxy.userData.isCollider = true;
mesh.parent.add(proxy);
```

The `addCollidableFiltered` method will register the proxy automatically when it finds `userData.isCollider = true`.

For procedurally generated structures (WorldBuilder objects), the factory functions already produce simple enough geometry that the full mesh BVH is efficient without a separate proxy.

### 3.12 Concave Geometry Handling

BVH raycasting works correctly for any mesh topology — convex or concave. However, **penetration depth** for concave geometry requires extra care: the naive algorithm may flip the normal direction when inside a concave shell.

Mitigation:
1. **Front-face only** — only test triangles facing the player (dot product of triangle normal and (player − triangle center) > 0). Culls inner faces.
2. **Contact deduplication** — merge contacts within 0.1 m of each other by averaging normals. Prevents vibration from near-coplanar overlapping contacts.
3. **Max contacts per body = 6** — excessive contacts from concave geometry are culled to the 6 most penetrating.

### 3.13 Ghost / Trigger Volumes

Trigger volumes detect entry/exit without blocking movement (zone boundaries, item pickups, dungeon portals):

```ts
export interface TriggerVolume {
  id: string;
  aabb: AABB;
  onEnter?: (playerId: string) => void;
  onExit?:  (playerId: string) => void;
}
```

These are stored separately from `CollisionBody` statics. Each frame:
```ts
private checkTriggers(playerAABB: AABB): void {
  for (const trigger of this.triggers.values()) {
    const overlapping = aabbOverlap(playerAABB, trigger.aabb);
    const wasOverlapping = this.activeTriggers.has(trigger.id);
    if (overlapping && !wasOverlapping) {
      trigger.onEnter?.(this.playerId);
      this.activeTriggers.add(trigger.id);
    } else if (!overlapping && wasOverlapping) {
      trigger.onExit?.(this.playerId);
      this.activeTriggers.delete(trigger.id);
    }
  }
}
```

Use cases:
- Zone boundary entry → fire `zoneTracker.onZoneChange`
- Item proximity → show interact prompt
- Dungeon portal → trigger dungeon system

### 3.14 NPC Collision Bodies (Capsule Pool)

NPCs are currently recreated as CANNON boxes every frame. Replace with a fixed pool of capsule bodies:

```ts
class NPCBodyPool {
  private pool: CollisionBody[] = [];
  private active: Map<THREE.Object3D, CollisionBody> = new Map();

  acquire(npc: THREE.Object3D): CollisionBody { ... }
  release(npc: THREE.Object3D): void { ... }
  updatePositions(): void { ... } // O(active.size), O(1) per NPC
}
```

NPC capsules: radius 0.4 m, height 1.8 m. Same capsule type as player. This means NPCs also use the BVH narrow phase consistently.

### 3.15 CollisionDebug Overlay

Toggle with `Alt+C`. Shows:

| Color | Meaning |
|---|---|
| 🟢 Green wireframe | BVH body (`isCollider = true`) — triangle-accurate |
| 🟡 Yellow wireframe | OBB body (rotated object, no BVH) |
| 🔷 Cyan wireframe | AABB body (axis-aligned fallback) |
| 🔵 Blue capsule outline | NPC dynamic body |
| 🔴 Red capsule outline | Player capsule |
| ⬜ White wireframe | Trigger volume |
| 🟠 Orange contact sphere | Active contact point this frame |

The debug overlay must render on top of all geometry (`depthTest: false`) so it is always visible even through walls. Implement as `THREE.LineSegments` with `depthTest: false` material.

Additional debug info rendered as canvas-2D overlay:
```
COLLISION DEBUG
Statics:  142 bodies (88 BVH, 34 OBB, 20 AABB)
Dynamic:   6 NPC capsules
Triggers:  4 volumes
Contacts:  3 this frame
Grounded:  YES  Slope: 12°
```

### 3.16 Performance Budget

Target: **< 1 ms** total collision work per frame at 200 static bodies.

| Stage | Target | Notes |
|---|---|---|
| Broad phase (AABB grid/BVH) | 0.05 ms | Eliminates 95%+ of bodies |
| OBB SAT tests | 0.1 ms | ~20 candidates × 15 axis tests |
| BVH capsule tests | 0.5 ms | ~5 candidate meshes × O(log n) BVH |
| Contact resolution | 0.1 ms | 4 iterations × simple vector math |
| Trigger check | 0.05 ms | AABB overlap only |
| Ground snap raycast | 0.05 ms | Single BVH ray |
| NPC body sync | 0.1 ms | Position update only, no rebuild |
| **Total** | **~1 ms** | |

Optimisation levers:
- BVH `maxLeafTris = 10` — controls BVH depth vs triangle test count trade-off.
- Skip objects outside a 30 m radius around the player entirely.
- Cache candidate lists; only rebuild when bodies change or player moves > 2 m.
- Run BVH builds in a Web Worker (see §3.18).

### 3.17 Collision Mesh LOD

Distant objects don't need triangle-accurate collision:

```
0–30 m from player:   Full BVH triangle collision
30–80 m from player:  OBB only (coarse, still blocks)
> 80 m from player:   No collision (AABB only for trigger volumes)
```

Implement as a `distanceClass` property on `CollisionBody`, updated lazily when the player moves > 5 m.

### 3.18 Web Worker BVH Builder (Optional, P2)

BVH construction for large meshes (> 5000 triangles) can spike the frame by 10–50 ms. Move it to a Web Worker:

```
Main thread:                Worker thread:
                            ┌────────────────────────────┐
mesh.geometry.toJSON() →→→ │ MeshBVH.fromJSON(geoData)  │
                            │ compute BVH (SAH strategy) │
                            │ serialize bvh to ArrayBuffer│
                            └────────────────────────────┘
                                         ↓
                     ←←← transfer ArrayBuffer back
mesh.geometry.boundsTree = MeshBVH.deserialize(buffer)
```

This keeps frame time smooth even when spawning large WorldBuilder structures.

### 3.19 Complete File Structure

```
client/src/systems/collision/
  types.ts              ← AABB, OBB, CollisionBody, ContactPoint, Capsule, TriggerVolume
  BVH.ts                ← Spatial acceleration structure (scene-level, not mesh-level)
  OBB.ts                ← OBB construction (8-corner) + SAT narrow phase (15 axes)
  CapsuleController.ts  ← Full kinematic character controller algorithm (§3.5)
  ContactSolver.ts      ← Contact generation: BVH path + OBB path + deduplication
  StepDetector.ts       ← Two-probe step-up algorithm (§3.7)
  SlopeSolver.ts        ← Slope classification + slide-down (§3.6)
  GroundSnap.ts         ← Downward raycast snap (§3.5 Step 4)
  NPCBodyPool.ts        ← Fixed capsule pool for NPC bodies (§3.14)
  TriggerSystem.ts      ← Ghost volume enter/exit detection (§3.13)
  CollisionDebug.ts     ← Visual overlay Alt+C (§3.15)

client/src/systems/CollisionSystem.ts
  ← Thin façade: wraps all sub-modules, exposes the same public API as today
     (addCollidable, addCollidablesFiltered, resolveMovement, isPositionBlocked,
      removeCollidable, etc.) so all callers need zero changes.
```

### 3.20 Migration from Current System

The public API of `CollisionSystem` is unchanged. Internal implementation is swapped. Migration steps:

1. `npm install three-mesh-bvh`
2. Remove `cannon-es` from `package.json`
3. Apply monkey-patches at app start (`THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree`)
4. Replace `createStaticBody` with new BVH/OBB builder
5. Replace `sweepAABB` with `CapsuleController.resolve`
6. Replace `resolveMovement` call site in `PlayerController.ts` to pass `Capsule` instead of `THREE.Vector3` pair
7. Remove all `CANNON.*` type imports

---

## 4. Phase 2 — WorldBuilder Object Library Expansion

### 4.1 New Object Type Taxonomy

Expand from 14 to 40+ types in `client/src/systems/worldbuilder/objects/`:

```
structures/     — moonwell, tower, ruins, castle_wall, gatehouse, drawbridge,
                  windmill, lighthouse, aqueduct, triumphal_arch, guard_post
vegetation/     — ancient_tree, mushroom_cluster, crystal_cluster, flower_meadow,
                  dead_tree, mangrove, giant_mushroom, vine_pillar
furniture/      — altar, runic_stone, lantern, wooden_fence, pavilion, market_stall,
                  throne, bookshelf, cauldron, forge, notice_board
terrain_deco/   — campfire, bonfire, portal_arch, standing_stones, burial_mound,
                  crater, lava_pool, frozen_pond, arcane_pillar
lighting/       — torch_post, glowing_orb, bioluminescent_bloom, fire_pit, arcane_beacon
npc_fixtures/   — treasure_chest, campsite
```

### 4.2 Visual Quality Standards

- `MeshStandardMaterial` with PBR: roughness, metalness, emissive.
- Structural parts: `userData.isCollider = true`, cast + receive shadows.
- Decorative parts: `userData.noCollision = true`, emissive glow values.
- Always snap Y to `terrain.getHeightAt(x, z)`.
- Support `rotation_y` parameter (set `group.rotation.y` after construction).
- Biome-aware coloring: query `getBiomeWeights(x, z)` and tint material accordingly.

### 4.3 Persistence (localStorage + server broadcast)

```ts
// client/src/systems/worldbuilder/WorldBuilderPersistence.ts
export class WorldBuilderPersistence {
  save(objects: PlacedObjectRecord[]): void;  // localStorage
  load(): PlacedObjectRecord[];
  clear(): void;
}
```

Server: new `world_state_sync` message broadcasts all placed objects on connect. Server holds `placed_objects` in `WorldState`.

### 4.4 Undo/Redo Stack

`Ctrl+Z` / `Ctrl+Shift+Z`. Stack of object-ID snapshots. Accessible from `WorldBuilderPanel` footer.

---

## 5. Phase 3 — Agentic World Extension Pipeline

### 5.1 Architecture

```
Player types / pastes image
        │
        ▼
WorldBuilderPanel ──── WorldModifyRequest ────────────────────────────▶ Server
  { prompt, position, zone, images: base64[] }                          │
                                                                         ▼
                                                              ┌──────────────────┐
                                                              │  WorldSpiritAgent │
                                                              │                  │
                                                              │  vision_parse ──▶│
                                                              │  context_gather  │
                                                              │  plan (Blueprint)│
                                                              │  validate        │
                                                              │  build (tools)   │
                                                              │  respond         │
                                                              └────────┬─────────┘
                                                                       │ stream
                                                      ┌────────────────▼──────────┐
                                                      │ world_modify_start         │
                                                      │ world_modify_chunk × N     │ ← one per object
                                                      │ world_modify_end           │
                                                      └───────────────────────────┘
                                                              │
                                                              ▼
                                                       Client receives chunks
                                                       → WorldBuilder.spawnObject (each chunk)
                                                       → CollisionSystem.addCollidablesFiltered
                                                       → WorldBuilderPersistence.save
                                                       → WorldBuilderPanel.onBuildChunk
```

### 5.2 LangGraph Agent — 6-Node Graph

```
START
  │
  ├─▶ [vision_parse]       If images: Claude vision → image_description string
  │         │
  ├─▶ [context_gather]     Inject zone, nearby objects, terrain height, water check
  │         │
  ├─▶ [plan]               LLM outputs a Blueprint (Pydantic JSON)
  │         │
  ├─▶ [validate]           Pure Python: type check, bounds check, water check, max count
  │         │
  ├─▶ [build]              Execute Blueprint: spawn_structure tool calls
  │         │
  └─▶ [respond]            Mystical flavour text
         │
        END
```

### 5.3 Blueprint Schema

```python
class PlacedItem(BaseModel):
    object_type: str
    x: float; z: float
    scale: float = 1.0
    rotation_y: float = 0.0
    label: str = ""

class Blueprint(BaseModel):
    title: str
    description: str
    items: list[PlacedItem]
    zone_hint: str = ""
```

### 5.4 Vision Input Pipeline

Client: image drag/drop + clipboard paste + file upload → base64 JPEG (max 3 images). Included in `WorldModifyRequest.images`.

Server `vision_parse` node calls LLM with image content blocks. Output: `image_description` injected into context.

### 5.5 Streaming Protocol

```
world_modify_start  { buildId }
world_modify_chunk  { buildId, action: {kind, params} }   ← one per spawned object
world_modify_end    { buildId, dialogue }
```

### 5.6 New Agent Tools

```python
spawn_structure(object_type, x, z, scale, rotation_y, label)
remove_structure(object_id)
place_vegetation_cluster(vegetation_type, x, z, count, radius)
query_world(query)           ← returns JSON of nearby objects + zone info
spawn_blueprint(json)        ← place a multi-item Blueprint atomically
set_zone_atmosphere(zone, mood)
```

---

## 6. Phase 4 — Enhanced WorldBuilderPanel

```
┌─────────────────────────────────────────────────────┐
│  🌍 World Spirit                             [×] [_] │
├─────────────────────────────────────────────────────┤
│  ZONE: Blasted Suarezlands  •  @ (-140, -245)       │
├─────────────────────────────────────────────────────┤
│  [📷] [📁]  Drag images here or paste from clipboard│
│  ┌──────────────────────────────────────────────┐   │
│  │ Build a cluster of ruined towers with        │   │
│  │ bioluminescent vines near me                 │   │
│  └──────────────────────────────────────────────┘   │
│  [Build ▶]   [Undo ↺]   [History ▾]   [Clear 🗑]   │
├─────────────────────────────────────────────────────┤
│  Building… ████████░░░░  5/8 objects placed         │
├─────────────────────────────────────────────────────┤
│  HISTORY                                            │
│  • 14:32 "3×ancient_tree near (-140,-245)"  [↺]    │
│  • 14:31 "portal_arch at (-120,-230)"       [↺]    │
└─────────────────────────────────────────────────────┘
```

---

## 7. Implementation Sequence

```
Phase 1 — Collision (3 sessions)
  1a. npm install three-mesh-bvh; npm uninstall cannon-es
  1b. Define types.ts: AABB, OBB, CollisionBody, ContactPoint, Capsule, TriggerVolume
  1c. Implement CapsuleController.ts (kinematic algorithm §3.5)
  1d. Implement ContactSolver.ts (BVH path + OBB SAT fallback)
  1e. Implement StepDetector.ts (two-probe §3.7)
  1f. Implement SlopeSolver.ts (§3.6)
  1g. Implement GroundSnap.ts (§3.5 step 4)
  1h. Implement BVH.ts (scene-level spatial acceleration)
  1i. Implement OBB.ts (8-corner construction + SAT 15 axes)
  1j. Implement TriggerSystem.ts
  1k. Implement NPCBodyPool.ts
  1l. Rewrite CollisionSystem.ts façade (same public API)
  1m. Implement CollisionDebug.ts overlay
  1n. Wire monkey-patches in main.ts; replace resolveMovement call

Phase 2 — Object Library (1 session)
  2a. Add 20 new object factories in worldbuilder/objects/
  2b. Persistence (localStorage + server sync)
  2c. Undo/redo

Phase 3 — Vision + Blueprint Agent (2 sessions)
  3a. Blueprint Pydantic schema + validate node
  3b. vision_parse node (image → description)
  3c. context_gather node (zone/water/nearby)
  3d. Streaming protocol (world_modify_chunk)
  3e. New tools: query_world, spawn_blueprint
  3f. MessageProtocol: images[], streaming types

Phase 4 — Panel UI (1 session)
  4a. Image attachment (drag, paste, upload)
  4b. Streaming progress bar
  4c. History log + per-entry undo
  4d. Zone + position status bar
```

---

## 8. Key Files

### Client
| File | Change |
|---|---|
| `systems/collision/types.ts` | New: core type definitions |
| `systems/collision/Capsule.ts` | New: capsule struct + factory |
| `systems/collision/CapsuleController.ts` | New: kinematic character controller |
| `systems/collision/ContactSolver.ts` | New: BVH + OBB contact generation |
| `systems/collision/StepDetector.ts` | New: two-probe step-up |
| `systems/collision/SlopeSolver.ts` | New: slope classification + slide |
| `systems/collision/GroundSnap.ts` | New: downward snap raycast |
| `systems/collision/BVH.ts` | New: scene-level spatial acceleration |
| `systems/collision/OBB.ts` | New: OBB construction + SAT narrow phase |
| `systems/collision/TriggerSystem.ts` | New: ghost trigger volumes |
| `systems/collision/NPCBodyPool.ts` | New: capsule pool for NPCs |
| `systems/collision/CollisionDebug.ts` | New: debug wireframe overlay |
| `systems/CollisionSystem.ts` | Rewrite: thin façade over sub-modules |
| `entities/PlayerController.ts` | Update: pass `Capsule` to `resolveMovement` |
| `systems/WorldBuilder.ts` | Expand object library + rotation + persistence |
| `ui/WorldBuilderPanel.ts` | Redesign: images, streaming, history |
| `network/MessageProtocol.ts` | Add images[], streaming types |
| `main.ts` | Wire monkey-patches, CollisionDebug, streaming handlers |
| `package.json` | `+three-mesh-bvh`, `-cannon-es` |

### Server
| File | Change |
|---|---|
| `agents/world_builder_agent.py` | 6-node graph: vision_parse, context_gather, plan, validate, build, respond |
| `agents/schemas/blueprint.py` | New: Blueprint + PlacedItem Pydantic models |
| `agents/tools/world_builder.py` | Add rotation_y, query_world, spawn_blueprint |
| `ws/handler.py` | Streaming world_modify_chunk protocol |
| `world/zones.py` | Add nearby-objects helper |

---

## 9. Success Criteria

### Collision
- [ ] Player enters the Blasted Suarezlands mountain from any angle → correctly blocked at the mesh surface, no clip.
- [ ] Player walks toward a diagonal fence → blocked at the exact fence geometry, not 2 m earlier.
- [ ] Player walks into a 0.3 m kerb → automatically steps over it without stopping.
- [ ] Player stands on a 30° slope → stands normally. On a 55° slope → slides down.
- [ ] Player walks under an arch → arch is solid above but walkthrough below. No ghost ceiling.
- [ ] `Alt+C` debug overlay shows green wireframes exactly matching every collidable mesh.
- [ ] Contact normals shown as orange spheres in debug view match actual surface orientation.
- [ ] 200 static bodies, 8 NPCs → collision resolve < 1 ms per frame at 60 fps.
- [ ] No clip-through at any speed up to 20 m/s.

### World Builder
- [ ] Designer prompts "build a ruined encampment 20 m north" → 4+ objects appear one-by-one within 5 s.
- [ ] Designer pastes a reference image → agent interprets style and places matching structures.
- [ ] Placed objects survive page refresh.
- [ ] `Ctrl+Z` undoes the last placed object or group atomically.
- [ ] Placed objects register correct BVH collision bodies — player is blocked by them precisely.


---
