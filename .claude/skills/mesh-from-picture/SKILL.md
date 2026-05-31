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

- `extends Mesh`; declare `static readonly type` and
  `static readonly category = 'building' as const`.
- `build(ctx: BuildContext): THREE.Group` — pure geometry only. **No** scene
  insertion, collision registration, or persistence.
- Start with `const g = new THREE.Group(); g.position.copy(ctx.position);` and use
  `ctx.scale` if the design should scale.
- Tag collision via `userData`: solid/blocking parts `isCollider = true`,
  decorative/emissive/high-up parts `noCollision = true`. (The `solid()`/`deco()`
  helpers in `BiomeKit` set these for you.)
- Reuse materials — cache via the kit (`m()` / `getMaterials()`), never create the
  same material per-mesh in a loop.
- End the file with `registerMesh(<ClassName>);`.

**Biome-style skeleton:**

```ts
import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class DesertTavern extends Mesh {
  static readonly type = 'biome_desert_tavern';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const sand = m(0xc8904a, 0.88);
    const roof = m(0x7a3a1a, 0.9);
    // …massing built from G.box / G.cylinder / G.cone … (≤ ~10 pieces)
    solid(g, G.box(5, 3, 4), sand, 0, 1.5);
    solid(g, G.cone(3.6, 1.8, 4), roof, 0, 3.9, 0, 0, Math.PI / 4);
    return g;
  }
}

registerMesh(DesertTavern);
```

For a **Málaga** building, import from `./MalakaKit` instead
(`getMaterials()`, `createArchedDoor`, `createRoofTile`, …) and follow `MalakaHouse.ts`.

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
