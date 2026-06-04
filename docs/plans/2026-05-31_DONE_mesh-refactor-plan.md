# Plan — Separate & Structure Buildings + Map Generation

**Goal:** Give every building (and, later, every world mesh) its own **class in its own file**
under a `meshes/` tree, registered in a central catalog. Map generation must consume meshes
from that catalog only — no inline geometry, no hand-maintained `switch` statements. All
placements stay data-driven in JSON.

---

## 1. Why (problem statement)

Buildings are currently spread across **three disconnected systems**, each with its own
dispatch mechanism and its own way of building geometry:

| System | File | Dispatch | Buildings |
|---|---|---|---|
| Authored landmarks | `worldbuilder/objects/structures.ts`, `mediterranean.ts` | `buildObject()` switch in `objects/index.ts` | 9 structures + 11 Málaga buildings |
| Procedural biome scatter | `worldbuilder/objects/biomeProps.ts` | `buildBiomeBuilding()` switch | 6 biomes × 3 internal (non-exported) variants |
| Encounter set-pieces | `worldbuilder/objects/encounterBuilders.ts` | `EncounterRegistry` | 9 set-pieces |

Consequences:
- Adding a building means editing a `switch` **and** a builder file in two places.
- Procedural building variants are private functions — they can't be authored or reused.
- "Building geometry" and "where/when to place a building" are tangled together.
- No single source listing every building the game can render.

---

## 2. Target architecture

### 2.1 One mesh = one class = one file

```
client/src/meshes/
  core/
    Mesh.ts              # abstract base class — all meshes extend this
    MeshRegistry.ts      # type string -> Mesh subclass; self-registration
    BuildContext.ts      # { position, scale, rotation, rng?, terrain? }
    index.ts             # side-effect imports every mesh file -> registers all
  buildings/
    malaka/
      MalakaHouse.ts
      MalakaPatioHouse.ts
      MalakaErmita.ts
      MalakaChurch.ts
      MalakaCastle.ts
      MalakaTower.ts
      MalakaWall.ts
      MalakaCortijo.ts
      MalakaBodega.ts
      MalakaHouseReconstructed.ts
      RomanAmphitheatre.ts
    structures/
      Moonwell.ts  Tower.ts  Ruins.ts  Altar.ts  RunicStone.ts
      WoodenFence.ts  Pavilion.ts  PortalArch.ts  Road.ts
    biome/
      ElvenTower.ts  MoonShrine.ts  RuinedOutpost.ts   # ex-private biomeProps fns
      EmberForge.ts  ... (one class per current variant)
  props/        # furniture + ambient props (later phase)
  vegetation/   # trees, mushrooms, crystals (later phase)
```

### 2.2 The base class

```ts
// meshes/core/Mesh.ts
export interface BuildContext {
  position: THREE.Vector3;
  scale: number;
  rotation?: [number, number, number];
  rng?: Rng;            // procedural placement passes its seeded RNG
  label?: string;
}

export abstract class Mesh {
  /** Stable id used in JSON + the registry. e.g. "malaka_church". */
  static readonly type: string;
  /** Category used by map generation to filter (building | prop | vegetation). */
  static readonly category: 'building' | 'prop' | 'vegetation';

  /** Build the Three.js group. Pure geometry — no scene/collision side effects. */
  abstract build(ctx: BuildContext): THREE.Object3D;
}
```

Each building becomes a small class:

```ts
// meshes/buildings/malaka/MalakaChurch.ts
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class MalakaChurch extends Mesh {
  static readonly type = 'malaka_church';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    // EXACT body of the current buildMalakaChurch() moves here, unchanged.
  }
}

registerMesh(MalakaChurch);
```

### 2.3 The registry (replaces every `switch`)

```ts
// meshes/core/MeshRegistry.ts
const registry = new Map<string, Mesh>();

export function registerMesh(cls: new () => Mesh & { type?: string }): void {
  const type = (cls as any).type as string;
  registry.set(type, new cls());            // one reusable instance per type
}

export function buildMesh(type: string, ctx: BuildContext): THREE.Object3D | undefined {
  return registry.get(type)?.build(ctx);
}

export function meshTypes(category?: string): string[] { /* for tooling/export */ }
```

**Adding a building = drop one file in `meshes/buildings/…` and it auto-registers.**
No dispatcher edits, ever.

### 2.4 Map generation consumes the catalog only

Map generation is **separated** from geometry into three clear roles:

| Layer | File | Responsibility |
|---|---|---|
| **Data** | `shared/data/world_manifest.json` | Where each authored building sits (`type` + `transform`) |
| **Authored placement** | `WorldGenerator` | Read manifest landmarks → `buildMesh(type, ctx)` |
| **Procedural placement** | `ProceduralPopulator` | Pick a building `type` for a biome → `buildMesh(type, ctx)` |

`WorldBuilder.spawnObject()` and `ProceduralPopulator._populate()` stop importing geometry
modules; they import only `buildMesh`. Biome→building selection becomes a **data table**
(`biome -> building type[]`) instead of private functions, so procedural buildings are now
authorable and reusable.

---

## 3. Phased execution

Each phase compiles, passes `make check`, and is independently shippable. Old and new paths
coexist until the final cleanup phase.

### Phase 0 — Scaffold (no behavior change)
- Create `meshes/core/` (`Mesh.ts`, `MeshRegistry.ts`, `BuildContext.ts`, `index.ts`).
- Add a compatibility shim: `buildObject()` first tries `buildMesh()`, then falls back to
  the existing switch. Nothing breaks.
- **Verify:** `make typecheck` passes; game still runs identically.

### Phase 1 — Migrate authored buildings (the user's "buildings in map")
- Move the 11 Málaga buildings from `mediterranean.ts` → one class file each under
  `meshes/buildings/malaka/`. Bodies copied verbatim; only the wrapper changes.
- Move the 9 `structures.ts` builders → `meshes/buildings/structures/`.
- Delete those builders from the old files once the registry serves them.
- **Verify:** Load each Málaga landmark from the manifest; visually unchanged. Fort Malaka
  (32 landmarks) renders identically.

### Phase 2 — Migrate procedural biome buildings (the user's "map generation")
- Promote the private `_elvenTower`, `_moonShrine`, … functions in `biomeProps.ts` into
  classes under `meshes/buildings/biome/`.
- Replace `buildBiomeBuilding()`'s `switch` with a data table:
  `BIOME_BUILDINGS: Record<BiomeType, string[]>` → `rng.pick()` → `buildMesh()`.
- `ProceduralPopulator` calls `buildMesh()` instead of `buildBiomeBuilding()`.
- **Verify:** Walk each biome; procedural buildings still appear at the same density (seeded
  RNG unchanged → identical layouts).

### Phase 3 — Cleanup & lock-in
- Remove the legacy `buildObject` switch fallback; registry is now the only path.
- Delete emptied `mediterranean.ts` / `structures.ts`; thin `biomeProps.ts` to props only.
- Add `meshes/core/index.ts` to the bootstrap import so all classes register on startup.
- **Verify:** `grep` shows no remaining geometry in `worldbuilder/objects/` for buildings;
  full `make check` green.

### Phase 4 (optional, follow-up) — JSON position export
- Add "Export placements → JSON" to `WorldBuilder`: serialize placed objects into
  manifest-shaped landmark entries (`id`, `type`, `transform`) for committing to
  `world_manifest.json`. Closes the localStorage→JSON gap.

---

## 4. Scope boundaries (this plan)

**In scope:** all buildings (authored + procedural + biome variants) and the map-generation
wiring that places them.

**Deferred to a later pass:** props/furniture, vegetation, encounter set-pieces, and NPC
body meshes. They follow the *same* `Mesh` base class + registry, so this plan establishes
the pattern they'll reuse. NPCs stay in `entities/` until then.

**No JSON schema change required** — authored buildings already carry `type` + `transform`
in `world_manifest.json`.

---

## 5. Net result

- Every building is a reusable class in its own file under `meshes/`.
- Map generation references buildings purely by `type` string + JSON position.
- Adding/refining a building never touches map-generation code.
- One catalog (`MeshRegistry`) lists every building the engine can spawn.
