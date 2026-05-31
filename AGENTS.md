# AGENTS.md — World of Promptcraft

Guidance for AI agents (and humans) working in this repo. For the full stack, project
structure, and commands see [`CLAUDE.md`](./CLAUDE.md). This file focuses on the
**mesh catalog** — the system that defines and places every building in the world.

## Golden rules

- **One mesh = one class = one file.** Never add building geometry inline in a `switch`.
- **`build()` is pure geometry.** No scene insertion, collision registration, or persistence
  inside a mesh class — the placement layer owns that.
- **Never edit a dispatcher to add a building.** Registration is automatic; you only add a file.
- **Preserve determinism.** Procedural placement uses a seeded RNG; don't reorder or add/remove
  RNG draws when touching `ProceduralPopulator` or `BiomeBuildings.ts`, or world layouts shift.
- Run `make check` (lint + typecheck + tests) before considering work done.

## The mesh catalog (`client/src/meshes/`)

```
meshes/
  core/
    Mesh.ts            # abstract base class + BuildContext
    MeshRegistry.ts    # registerMesh · buildMesh · hasMesh · meshTypes
  index.ts             # importing this registers every mesh; re-exports the API
  buildings/
    index.ts           # side-effect imports every building file
    malaka/            # 11 Andalusian classes + MalakaKit (shared materials/helpers)
    structures/        # 9 generic classes (Moonwell, Tower, Ruins, Road, …)
    biome/             # 19 procedural classes + BiomeKit + BiomeBuildings (biome→type[])
```

- **Catalog (geometry):** the `meshes/` tree. Each class knows how to build itself.
- **Placement (where/when):** `WorldBuilder` (authored landmarks from
  `shared/data/world_manifest.json`), `ProceduralPopulator` (per-biome procedural spawns),
  and `Forest.ts` (a few set-pieces). They call `buildMesh(type, ctx)` — never geometry directly.

## How to add a new building

1. **Create the class file** under the right folder, e.g.
   `client/src/meshes/buildings/structures/Watchtower.ts`:

   ```ts
   import * as THREE from 'three';
   import { Mesh, BuildContext } from '../../core/Mesh';
   import { registerMesh } from '../../core/MeshRegistry';

   export class Watchtower extends Mesh {
     static readonly type = 'watchtower';          // stable id used in JSON + registry
     static readonly category = 'building' as const;

     build(ctx: BuildContext): THREE.Group {
       const { position: pos, scale } = ctx;
       const g = new THREE.Group();
       g.position.copy(pos);
       // …geometry here. Tag solid parts userData.isCollider = true,
       //   decorative/emissive parts userData.noCollision = true.
       return g;
     }
   }

   registerMesh(Watchtower);
   ```

2. **Register it for import** by adding one line to `client/src/meshes/buildings/index.ts`:
   `import './structures/Watchtower';`

3. **Place it:**
   - *Authored* (fixed location): add a landmark entry to `shared/data/world_manifest.json`
     with `"type": "watchtower"` and a `transform`. `WorldGenerator` spawns it automatically.
   - *Procedural* (scattered in a biome): add `'watchtower'` to that biome's array in
     `client/src/meshes/buildings/biome/BiomeBuildings.ts`. `selectBiomeBuildingType()` will
     pick it via the seeded RNG.

That's it — no dispatcher or `switch` edits.

## Shared kits

- **`malaka/MalakaKit.ts`** — Andalusian material cache (`getMaterials()`) plus architectural
  helpers (`createArchedDoor`, `createRoofTile`, `createMachicolations`, …). Import these in
  Málaga building classes so canvas textures/materials are built once and reused.
- **`biome/BiomeKit.ts`** — `m()` (cached material factory) and `solid()` / `deco()` mesh
  helpers shared by procedural biome buildings and the ambient props in
  `systems/worldbuilder/objects/biomeProps.ts`.

## Conventions reminder (see CLAUDE.md for the rest)

- TypeScript strict; no `any`; classes for entities/systems, interfaces for data shapes.
- Reuse Three.js vectors/materials to avoid GC pressure; cache materials in the kits.
- Tag collision via `userData`: `isCollider = true` blocks movement, `noCollision = true` passes through.
- Conventional commits (`feat:`, `fix:`, `refactor:`, …). Never commit `.env` files or API keys.

## Not yet migrated

Props, vegetation, encounter set-pieces, and NPC body meshes still live under
`systems/worldbuilder/objects/` and `entities/`. They will adopt the same `Mesh` base class +
registry in a follow-up pass — reuse this pattern when you migrate them.
