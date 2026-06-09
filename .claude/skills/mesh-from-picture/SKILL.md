---
name: mesh-from-picture
description: Create a new building mesh in World of Promptcraft from a reference picture. Use whenever the user supplies an image (photo, concept art, screenshot) of a building/structure and wants it reproduced as a class-based Three.js mesh in the mesh catalog, registered and placeable in the world. Handles analyzing the image, generating the Mesh class, registering it, and wiring it into authored or procedural placement.
argument-hint: [path or attached image + optional target, e.g. "make this a desert building" or "add to Málaga"]
---

# Mesh From Picture

You are adding a **building mesh** to **World of Promptcraft** by reproducing a
reference image as a class in the mesh catalog. The world is built one way: every
building is a class in its own file under `client/src/meshes/`, self-registered in a
central registry, and placed by `type` string. There is **no `switch` dispatch** and
**no inline geometry** — see `AGENTS.md` and `client/ARCHITECTURE.md` ("Mesh Catalog
& Registry").

## Before you start — read the pattern

1. Read **`AGENTS.md`** (repo root) — the golden rules and the "How to add a new
   building" workflow. This skill is the picture-driven version of that workflow.
2. Read **one existing class** close to the target style as a template:
   - Andalusian/whitewashed/stone → `client/src/meshes/buildings/malaka/MalakaHouse.ts`
     (+ shared `malaka/MalakaKit.ts` material cache + architectural helpers)
   - Stylized/flat-shaded/biome → `client/src/meshes/buildings/biome/Inn.ts`
     (+ shared `biome/BiomeKit.ts` `m()` / `solid()` / `deco()` helpers)
   - Simple generic structure → `client/src/meshes/buildings/structures/Tower.ts`
3. Skim **`client/src/systems/worldbuilder/objects/geoCache.ts`** — the cached
   primitive factory you should build from: `box`, `cylinder`, `cone`, `sphere`,
   `torus`, `octahedron`, `dodecahedron`.

If you need deeper Three.js geometry help, the `threejs-geometry` skill is available.

## Step 1 — Analyze the picture

Look at the image and extract a concrete build plan. Write a short bullet list
(share it with the user) covering:

- **Overall form & silhouette** — footprint shape, number of volumes, rough
  proportions (W×D×H in world units; typical buildings are ~4–16 units wide).
- **Massing** — break the structure into ≤ ~10 primitive pieces (base/foundation,
  body/walls, roof, tower, chimney, etc.). Strong silhouette beats fine detail.
- **Materials & palette** — wall, roof, trim, glass, emissive accents. Note hex
  colours sampled from the image.
- **Distinct features** — arches, crenellations, domes, sails, glowing windows.
- **Style bucket** → which folder/kit:
  - `malaka/` (PBR textures via `MalakaKit.getMaterials()`),
  - `biome/` (flat-shaded `m()` materials + `solid`/`deco`),
  - `structures/` (standalone, own `MeshStandardMaterial`s).

Match the **existing visual language** of that bucket, not a photoreal copy — flat,
readable, low-poly silhouettes consistent with the game.

## Step 2 — Choose identity & placement

- **Class name**: PascalCase, e.g. `DesertTavern`.
- **`type` string**: snake_case stable id. Prefix biome buildings with `biome_`
  (e.g. `biome_desert_tavern`) to match the existing convention; authored
  structures/Málaga use a bare id (e.g. `desert_tavern`).
- **Folder/category**: `malaka/`, `biome/`, or `structures/` — all `category = 'building'`.
- **Placement intent** (confirm with the user if ambiguous):
  - *Authored* (fixed spot) → world manifest entry, or
  - *Procedural* (scattered in a biome) → add to the biome table.

## Step 3 — Create the class file

Create `client/src/meshes/buildings/<bucket>/<ClassName>.ts`. Rules:

- **Identity**: `extends Mesh`; declare `static readonly type` and
  `static readonly category = 'building' as const`.
- **Pure Build**: `build(ctx: BuildContext): THREE.LOD` (or `THREE.Group`). The
  method must be "pure" — it creates and returns an object but does **not**
  perform scene insertion or side effects.
- **Visual Integrity**:
  - **No Z-Fighting**: Overlapping geometries (e.g., walls meeting floors) must
    be "buried" (intersected) rather than coplanar. Use small nudges or "sinks"
    (e.g., `0.01 * scale`) to ensure distinct depth. **Check internal
    intersections: composite/radial parts (arches, crosses, moldings) must use
    "Alternating Nudges" (e.g., `0.002 * scale` on every other segment) to avoid
    coplanar faces. Foundations/plinters must be slightly LARGER (expanded by
    ~0.1 * scale) than the walls they support to prevent base flickering.**
    Two large flat planes stacked on each other (patio border + floor, terraces)
    must be separated by `> 0.01 * scale` in Y, and an emissive glow/backlight
    plane behind glass must sit behind the glass *back face* (clear its
    half-depth), never coplanar with it.
  - **No Floating Fixtures**: Every window/door/shutter/balcony must have a flush
    wall behind it at its `(x, z)`. Watch **recessed upper floors/balconies**
    (the wall is set back — a window at the lower-floor offset floats) and **wings
    shorter than the façade** (a window loop spanning the full footprint
    overshoots them). Drive opening positions from the actual wall extent and skip
    openings over recesses.
  - **No Clipping / Oversized Features**: A centred or recessed feature (balcony
    slab, terrace, awning) sized to the full façade width pokes out past narrower
    or set-back walls. Size it to the **actual opening/recess** (e.g. the gap
    between flanking wings), not the building's outer width. **Avoid stacking two
    same-material boxes to fake a moulding** (cornice+cap, zócalo+cap): the cap is
    coplanar with the band top and leaves near-coplanar parallel faces → flicker.
    Use a single proud band box; if a cap is truly needed, make it clearly proud
    (`> 0.05 * scale`) or clearly inset, never ~coincident. A member embedded in a
    wall (beam, string-course) must not align a face with the wall's own face
    plane (e.g. a beam top at the floor line) — sink it clear.
  - **Scale-Aware Offsets**: Every literal margin/step/nudge/overhang MUST be
    `* scale` — `w + 0.2 * scale`, never `w + 0.2`. A bare constant breaks at
    non-unit scale (collapses when large, dominates when small). Audit every
    `+ 0.x` / `- 0.x`.
  - **Sink without a gap**: To bury a base whose TOP must stay put (a body rests
    on it), extend the geometry downward (raise height, lower centre so the top is
    unchanged); don't lower the whole box, or what sits on it floats.
  - **World Tiling**: Large or non-uniform primitives MUST use
    `applyWorldTiling(group, material)` to drive UVs from world units rather than
    local 0-1 mapping. **Custom BufferGeometry MUST explicitly define a `uv`
    attribute based on world units (e.g., 1 unit = 1 meter) rather than a 0-1
    range, and call `geo.computeVertexNormals()` or textures and lighting will
    not render correctly.** Use `DoubleSide` for thin surfaces. **Low flat
    cylinders/cones** (disc floors, drums, basins): `applyWorldTiling` stretches
    their top/bottom caps (it tiles caps by circumference×height) — after tiling,
    re-map cap UVs (`|normal.y| > 0.9`) to world XZ.
- **Performance (LOD)**:
  - **LOD Wrapper**: Every building MUST be wrapped in `withLOD(group)` at the
    end of the `build()` method.
  - **Flat Color Fallback**: All `MeshStandardMaterial`s should define
    `userData.flatColor` (a hex number representing the average tone) to allow
    the LOD system to swap textures for matching solid colors at a distance.
- **Performance — draw calls & lighting (CRITICAL — the renderer is draw-call
  bound; a dense scene died at 5000+ draws on a high-end GPU):**
  - **Geometry auto-merges; materials do NOT.** `buildMesh` / `withLOD`
    automatically collapse a mesh's opaque sub-meshes into **one draw call per
    material** (`meshes/core/mergeStatic.ts`). Building from many small
    primitives is fine — but **every distinct material is its own draw after
    merging.** Keep the material count low: reuse the kit's cached materials and
    **never `new THREE.MeshStandardMaterial(...)` per item in a loop** (a unique
    colour per book / tile / pot / crate). Pull from a small shared palette. A
    70-piece building with 5 materials = 5 draws; with a material per piece = 70.
  - **Don't defeat the merge.** Only opaque, single-material, visible meshes
    merge. `transparent` meshes, multi-material meshes (material arrays),
    `InstancedMesh` / `SkinnedMesh`, and invisible collider proxies stay separate
    (each = its own draw). Use `transparent` only where genuinely needed (glass,
    glow); never on opaque stone/wood.
  - **NEVER add real lights to a mesh.** A `THREE.PointLight` / `SpotLight` /
    `HemisphereLight` created in `build()` changes the scene's light count, which
    forces Three.js to **recompile every material in the game** (100–600 ms
    stalls) and costs every lit fragment forever. For a glowing
    lantern/window/fire/ember, use an **emissive material + bloom** (`emissive` +
    `emissiveIntensity`) — the bloom pass makes it glow with zero lights. If a
    prop truly must cast local light, register it with the shared pool:
    `addLightEmitter(group, localPos, { color, intensity, distance, decay })`
    from `scene/PointLightPool` — never `new THREE.PointLight`.
  - **Instance repeated identical meshes.** If the mesh is scattered MANY times
    with geometry identical per placement (trees, rocks, fence posts — only
    pos/rot/scale differ), add `static readonly instanceable = true`; the
    populator then draws all copies in a chunk as one `InstancedMesh` per
    material. Do NOT set it if `build()` varies shape by `position`/`rng` (e.g. a
    per-tree bend) — instanced copies must be identical.
- **Physics & Collisions**:
  - **Explicit Proxies**: Do NOT rely on render meshes for collisions. Use
    `boxCollider` or `cylinderCollider` from `colliderProxy.ts` to create a
    simplified convex footprint.
  - **Collider Tagging**: Tag decorative/emissive/high-up parts with
    `mesh.userData.noCollision = true`.
- **Materials**: Reuse materials — cache via the kit (`m()` / `getMaterials()`),
  never create the same material per-mesh in a loop.

**Málaga-style skeleton (High Quality):**

```ts
import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from './MalakaKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaVilla extends Mesh {
  static readonly type = 'malaka_villa';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const w = 8 * scale, h = 5 * scale, d = 6 * scale;

    // 1. Plinth (buried foundation)
    const plinthH = 0.5 * scale;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2 * scale, plinthH, d + 0.2 * scale), mats.stone);
    plinth.position.y = plinthH / 2 - 0.1 * scale; // sink into ground
    g.add(plinth);

    // 2. Main Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.stucco);
    body.position.y = plinthH + h / 2 - 0.1 * scale; // bury into plinth to avoid Z-fighting
    body.castShadow = body.receiveShadow = true;
    g.add(body);

    // 3. Explicit Physics Proxy
    const proxy = boxCollider(w, h + plinthH, d);
    proxy.position.y = (h + plinthH) / 2;
    g.add(proxy);

    // 4. Final Polish
    applyWorldTiling(g, mats.stone);
    return withLOD(g);
  }
}

registerMesh(MalakaVilla);
```

## Step 4 — Register the file

Add one side-effect import to `client/src/meshes/buildings/index.ts` under the right
group, e.g. `import './biome/DesertTavern';`. That is the **only** wiring needed for
the registry to know the type.

## Step 5 — Place it in the world

- **Authored (fixed location):** add a landmark to `shared/data/world_manifest.json`
  with `"type": "biome_desert_tavern"` and a `transform` (position/scale/rotation).
  `WorldGenerator` spawns it automatically.
- **Procedural (scattered in a biome):** add the `type` string to that biome's array
  in `client/src/meshes/buildings/biome/BiomeBuildings.ts`. **Preserve seeded-RNG
  determinism** — append to the array; do not reorder existing entries or change how
  many RNG draws happen, or existing world layouts will shift.

## Step 6 — Verify

1. `cd client && npx tsc --noEmit` — types clean.
2. `cd client && npx eslint src` — lint clean (no `any`; unused private members must
   be `_`-prefixed or removed).
3. `cd client && npx vitest run` — tests pass. If you add a determinism-sensitive
   change, confirm `WorldGenerator.test.ts` still passes.
4. Optional but recommended: `cd client && npm run dev` and visually confirm the mesh
   matches the picture; iterate on proportions/materials.

## Output to the user

Report: the new class + `type`, the bucket it landed in, how it's placed (manifest
entry or biome table), the verification results, and a one-line note on any visual
simplifications you made vs. the reference image. Remind them a live `npm run dev`
look is the final check, since automated checks don't render geometry.
