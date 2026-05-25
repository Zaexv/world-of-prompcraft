# Item, Collision & Position Diagnosis Plan

> **Purpose**: Root-cause analysis of why the Blasted Suarezlands hill collides wrongly,
> why Fort Malaka / main areas are visually or logically misplaced, and what must be fixed.

---

## TL;DR — Root Causes

| # | Issue | Root Cause | Severity |
|---|-------|-----------|----------|
| 1 | Hill has no collision | Mountain mesh marked `noCollision = true` on group + all children | P0 |
| 2 | Zone name doesn't match content | Blasted Suarezlands zone centroid is **186 units away** from the actual geometry | P0 |
| 3 | Terrain mesh vs player height mismatch on slopes | Terrain vertices use `computeHeight` only; vertical lift not baked in | P1 |
| 4 | Structures clip through hill or float at slope edges | `getAnchoredTerrainY` samples raw noise only, not world height with lift | P1 |
| 5 | NPC server-driven movement always at Y = 0 | `move_npc` tool hardcodes `"position": [x, 0, z]` | P1 |
| 6 | Procedural trees invade Fort Malaka buildings | `WorldGenerator.spawnTrees` ignores city footprints near Fort Malaka | P2 |
| 7 | `getAnchoredTerrainY` bias toward terrain minimum | `avg * 0.55 + min * 0.45` causes buildings to sink on convex slopes | P2 |

---

## Part 1 — Blasted Suarezlands Hill Collision

### 1.1 What you see in-game

Walking into the hill from the side allows you to clip through the visual geometry.
The player character floats/snaps upward on approach but there are no wall-like collision
surfaces — you can walk "into" the hill and get stuck or teleport to the top abruptly.

### 1.2 Root cause: `createSuarezlandsMountain` marks everything `noCollision`

**File**: `client/src/scene/FortMalaka.ts`, line 1058–1099

```ts
const group = new THREE.Group();
group.userData.noCollision = true;   // ← entire group skipped by collision system

const lower = new THREE.Mesh(...);
lower.userData.noCollision = true;   // ← every child mesh also explicitly skipped

const upper = new THREE.Mesh(...);
upper.userData.noCollision = true;

// buttresses (×10)
buttress.userData.noCollision = true;
```

Then in `main.ts`, line 419:
```ts
collisionSystem.addCollidablesFiltered(sceneManager.fortMalaka.groups);
```

`addCollidablesFiltered` hits the first guard at line 116:
```ts
if (group.userData.noCollision === true) return;  // exits immediately for the mountain
```

**Result**: Zero AABB bodies exist for the mountain. The hill is a ghost — fully visual, fully passable.

### 1.3 How the player "climbs" it anyway (and why it feels wrong)

The player Y is snapped to `getWorldHeightAt = terrain.getHeightAt(x, z) + getVerticalLiftAt(x, z)`.

`getVerticalLiftAt` (`VerticalTerrain.ts`) applies a smooth radial lift:

```
dist ≤ innerRadius (26):   lift = 16
dist ∈ [26, 74]:           lift = smoothstep falloff from 16 → 0
dist ≥ outerRadius (74):   lift = 0
```

So the player is pushed upward by the lift function. But:
- There are no **lateral wall colliders** on the hill slopes — the player slides right through the visual rock mesh
- The visual mountain cylinders don't perfectly match the `smoothstep` radial profile — at the outer slope the player "teleports" upward but can still visually intersect the geometry
- The mountain group is pushed to `this.groups` and `this.footprints` but produces no physics

### 1.4 Fix required

**`FortMalaka.ts` — `createSuarezlandsMountain`:**
- Remove `userData.noCollision = true` from `lower` and `upper` cylinder meshes
- Add `userData.isCollider = true` to `lower` and `upper`
- Remove `group.userData.noCollision = true` from the group
- The large cylinders will produce AABB bodies that act as wide slope walls

> Note: The inner/outer cylinder radius difference naturally makes them slope-like walls.
> The swept AABB collision in `CollisionSystem.resolveMovement` will slide the player
> around them rather than letting them pass through.

---

## Part 2 — Zone Name / Content Location Mismatch

### 2.1 The numbers

**Blasted Suarezlands zone boundaries** (`server/src/world/zones.py` + `client/src/systems/ZoneTracker.ts`):

```
X: -80  → 80
Z: -155 → -90
Zone center: (0, -122.5)
```

**Actual mage-district content** (`VerticalTerrain.ts` + `FortMalaka.ts`):

```
Mountain center:  (-140, -245)
Mountain X span:  -214 → -66   (outerRadius = 74)
Mountain Z span:  -319 → -171
Zone center offset from content: 186 world units
```

**None of the Blasted Suarezlands structures are inside the Blasted Suarezlands zone.**

| Structure | World Position | In SZ Zone? | In Fort Malaka Zone? |
|-----------|---------------|------------|---------------------|
| Mountain  | (−140, −245)  | ❌ No       | ✅ Yes               |
| Mage Tower | (−140, −245) | ❌ No       | ✅ Yes               |
| Arcane Gateway | (−140, −213) | ❌ No  | ✅ Yes               |
| All 6 Pylons | (−160/−132, −225/−270) | ❌ No | ✅ Yes       |
| Mage Houses | (−162/−118, −250/−233) | ❌ No | ✅ Yes      |

When a player stands at the Mage Tower they are told: **"Fort Malaka"** — not *Blasted Suarezlands*.

### 2.2 Why this happened

The zone definitions were likely authored early (a conceptual layout), then the actual FortMalaka
3D geometry was placed later using a different coordinate anchor. The `VERTICAL_PLACES` mountain was
placed at `(-140, -245)` to avoid overlapping the beach/promenade area (`z ≈ -155 to -185`) and
to sit on the western side away from La Alcazaba (`x = 30, z = -152`). The zone definitions were
never updated to reflect where the geometry ended up.

### 2.3 Secondary effect: Zone overlaps cause edge-case bugs

The Blasted Suarezlands zone (`x: -80..80, z: -155..-90`) currently sits in an empty part of the
Fort Malaka area — there's no authored content there. Players crossing it get a zone banner for
a place that looks like Fort Malaka beach/casita territory with no visible mage district.

Fort Malaka zone (`x: -150..150, z: -400..-80`) is large and does contain all the content,
but because it comes second in the check list, it only fires after the Suarezlands check. Since
Suarezlands zone is at z: -90 to -155, it carves a horizontal band out of Fort Malaka where
the zone becomes "Blasted Suarezlands" incorrectly (no mage content exists there).

### 2.4 Fix required

**Server** `server/src/world/zones.py` — update Blasted Suarezlands boundaries to match geometry:
```python
{
    "name": "Blasted Suarezlands",
    # Center the zone on the actual mountain: (-140, -245)
    "min_x": -220.0,   # mountain.centerX - outerRadius - 6
    "max_x": -60.0,    # mountain.centerX + outerRadius + 14
    "min_z": -325.0,   # mountain.centerZ - outerRadius - 6
    "max_z": -160.0,   # mountain.centerZ + innerRadius + generous overlap
},
```

**Client** `client/src/systems/ZoneTracker.ts` — mirror exactly:
```ts
{ name: "Blasted Suarezlands", minX: -220, maxX: -60, minZ: -325, maxZ: -160, ... }
```

> **Note**: The Fort Malaka zone must also shrink or be adjusted so it doesn't overlap
> the new Suarezlands boundary, or Suarezlands must stay first in the list (it already is).

---

## Part 3 — Terrain Visual vs Player Height Mismatch

### 3.1 Root cause: `Terrain.loadChunk` doesn't include vertical lift

**File**: `client/src/scene/Terrain.ts`, line 311:
```ts
positions.setY(i, Terrain.computeHeight(lx, lz));  // no getVerticalLiftAt call
```

**File**: `client/src/main.ts`, line 258:
```ts
return getWorldHeightAt(terrain, x, z);  // = terrain.getHeightAt + getVerticalLiftAt
```

The **visual terrain mesh** is flat at `computeHeight` values.
The **player Y** includes `getVerticalLiftAt`.

At the mountain transition zone (`outerRadius = 74` down to `innerRadius = 26`):
- The player is lifted 0–16 units above the visual terrain mesh
- The mountain visual cylinders partially cover this gap, but the cylinder radii are authored estimates (not the exact smoothstep curve), so there are areas where the player floats visibly above terrain, or where the mountain cylinder overhangs the player's snapped height

### 3.2 Fix options

**Option A (preferred — no terrain chunk changes needed)**: Accept the terrain mesh / lift split as-is.
The mountain visual cylinders exist precisely to fill the gap visually. The fix is ensuring the
cylinder geometry radii match the `smoothstep` profile more closely (see Part 1 fix), and the
collision bodies match the shape.

**Option B (cleaner long-term)**: Bake `getVerticalLiftAt` into terrain chunk generation:
```ts
positions.setY(i, Terrain.computeHeight(lx, lz) + getVerticalLiftAt(lx, lz));
```
This makes the terrain mesh and player height fully consistent. However, the mountain visual
cylinders would need to be removed or reduced since the terrain itself would form the hill.
Collision for the hill would then come from the terrain (no AABB bodies needed).

---

## Part 4 — Structures on Hill Slopes Mis-anchored

### 4.1 Root cause: `getAnchoredTerrainY` samples raw terrain, not world height

**File**: `client/src/scene/TerrainPlacement.ts`, line 65:
```ts
export function getAnchoredTerrainY(terrain, x, z, footprintRadius): number {
  const stats = sampleTerrainHeightStats(terrain, x, z, footprintRadius);
  return stats.avg * 0.55 + stats.min * 0.45;
}
```

`sampleTerrainHeightStats` calls `terrain.getHeightAt` only — no `getVerticalLiftAt`.

For structures near the hill edge, some sample points are inside the lift area and some are
outside. The `avg/min` of raw terrain heights is used, then the lift for just the center
point is added. If the sample circle straddles the `outerRadius` boundary, the sampled
minimum could be unlifted terrain while the lift added is for the center — producing
a height that's inconsistent with both the terrain mesh and the player's ground height.

### 4.2 The `suarezY` helper in `FortMalaka.ts`

```ts
const suarezY = (x, z, radius) =>
  getAnchoredTerrainY(terrain, x, z, radius) + getVerticalLiftAt(x, z);
```

This correctly adds lift at the structure center. But `getAnchoredTerrainY` still
samples raw terrain around the footprint radius without lift. For structures exactly on the
mountain center the error is zero (all lift = 16). For structures near the edge
(outerRadius ~ 74), samples straddle the lift boundary and produce incorrect anchoring.

### 4.3 Fix required

Create a `getWorldAnchoredTerrainY` function in `TerrainPlacement.ts` that samples
`getWorldHeightAt(terrain, sx, sz)` (terrain + lift) at each sample point:

```ts
import { getWorldHeightAt } from './VerticalTerrain';

export function getWorldAnchoredTerrainY(terrain: Terrain, x: number, z: number, r: number): number {
  let min = getWorldHeightAt(terrain, x, z);
  let sum = min;
  let count = 1;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const h = getWorldHeightAt(terrain, x + Math.cos(angle) * r, z + Math.sin(angle) * r);
    min = Math.min(min, h);
    sum += h;
    count++;
  }
  const avg = sum / count;
  return avg * 0.55 + min * 0.45;
}
```

Then use this in `FortMalaka.ts` instead of `getAnchoredTerrainY` for structures inside
the mountain footprint.

---

## Part 5 — NPC Server-Driven Movement Always at Y = 0

### 5.1 Root cause

**File**: `server/src/agents/tools/environment.py`, line 77:
```python
pending_actions.append({
    "kind": "move_npc",
    "params": {"position": [destination_x, 0, destination_z]},  # ← hardcoded Y=0
})
```

When an NPC agent calls `move_npc`, the Y coordinate is always 0. The client
`ReactionSystem` lerps the NPC mesh to this position — the NPC appears to sink into the
ground or float at world origin height.

### 5.2 Fix required

The server doesn't know terrain height. The client should override Y when applying `move_npc`:

**File**: `client/src/systems/ReactionSystem.ts` — in the `move_npc` case, snap Y to terrain:
```ts
case 'move_npc': {
  const target = new THREE.Vector3(
    p.position[0],
    getWorldHeightAt(terrain, p.position[0], p.position[2]),  // ← snap to terrain
    p.position[2],
  );
  // ... existing lerp code
}
```

---

## Part 6 — Procedural Trees in Fort Malaka

### 6.1 Root cause

**File**: `client/src/systems/WorldGenerator.ts`

`spawnTrees` uses `exclusionFootprints` to avoid building positions, but the Fort Malaka
footprints (from `sceneManager.fortMalaka.footprints`) must be explicitly registered.

**File**: `client/src/main.ts`, line 622:
```ts
...sceneManager.fortMalaka.footprints,
```
This line does wire Fort Malaka footprints in. Verify `worldGenerator.setExclusionFootprints`
is called BEFORE the first terrain chunks trigger `spawnTrees`. If the initial chunks fire
before the footprints are set, trees will spawn inside buildings.

---

## Part 7 — `getAnchoredTerrainY` Min-bias

### 7.1 Root cause

The formula `avg * 0.55 + min * 0.45` was designed to prevent structures from floating above
uneven terrain. However, on a convex hill (terrain going up toward center), the `min` sample
is the lowest ring point, pulling the anchor down — causing the base of a structure to visually
intersect the terrain on the upslope side.

### 7.2 Fix

For structures that sit flat (plazas, promenades), using just `avg` or `min + 0.3` reduces
visual clipping. For tall structures (towers, mage tower), use `min` to ensure the base doesn't
float. Consider per-structure tuning or a dedicated parameter.

---

## Implementation Checklist

### P0 — Fix now
- [ ] `FortMalaka.ts`: Add `userData.isCollider = true` to mountain `lower` + `upper` cylinders, remove `noCollision` from them and the group
- [ ] `zones.py` + `ZoneTracker.ts`: Move Blasted Suarezlands zone boundaries to `[-220, -60] × [-325, -160]`

### P1 — Fix soon
- [ ] `TerrainPlacement.ts`: Add `getWorldAnchoredTerrainY` that samples world height (terrain + lift)
- [ ] `FortMalaka.ts`: Use `getWorldAnchoredTerrainY` for structures near the mountain
- [ ] `environment.py` (`move_npc` tool): Pass Y=`None` or rely on client-side terrain snap
- [ ] `ReactionSystem.ts` (`move_npc` case): Snap NPC Y to `getWorldHeightAt` on client

### P2 — Polish
- [ ] Verify `WorldGenerator.setExclusionFootprints` is called before first chunk loads
- [ ] Review `getAnchoredTerrainY` formula for each structure type
- [ ] Add explicit tests: zone lookup for `(-140, -245)` returns "Blasted Suarezlands"

---

## Reference Coordinates

| Location | World Position | Notes |
|----------|---------------|-------|
| Mountain center | (-140, −245) | `VERTICAL_PLACES[0]` |
| Mountain outerRadius | 74 units | X span: −214 → −66, Z span: −319 → −171 |
| Mountain innerRadius | 26 units | flat top plateau |
| Mountain peak height | +16 above terrain | via `getVerticalLiftAt` |
| Mage Tower base | (−140, −245) | same as mountain center |
| Arcane Gateway | (−140, −213) | suarezCenterZ + 32 |
| Pylons | (−160/−132, −225/−270) | all at lift=16 (on plateau) |
| La Alcazaba | (30, −152) | coastal, no lift needed |
| Beach promenade | z ≈ −159 | flat beach terrain |
| Blasted SZ zone (current) | x: −80→80, z: −155→−90 | **Wrong — no content here** |
| Blasted SZ zone (proposed) | x: −220→−60, z: −325→−160 | Covers all mage content |
