# NPC Improvements — Right Skins Everywhere, Decoupled

**Date:** 2026-06-04
**Scope:** Frontend (client mesh/appearance/spawn) + Backend (manifest/NPC definitions)
**Goal:** Every NPC across the whole world map renders its correct mesh/skin, via a
**single, decoupled, maintainable** appearance pipeline.

---

## 1. Problem

- NPCs show wrong/generic skins. Unique named NPCs (Nireg Jenkins, Aurelia, El Tito) all
  render as the same blocky leather humanoid.
- The authored mesh library is never used at runtime.
- Appearance logic is tangled inside the `NPC` entity and duplicated across spawn sites.

## 2. Root Cause

### 2.1 Mesh library is dead code
`EntityManager.addNPC()` → `NPC.create()` → `NPC` constructor calls `buildProceduralMesh()`
**directly** (`client/src/entities/NPC.ts:64-65`). It never queries `MeshRegistry`. The
authored meshes registered in `client/src/meshes/npcs/index.ts` (`npc_individual_<id>`,
`npc_style_<style>`, classes `NiregJenkins`/`AureliaTrader`/`ElTito`) are only reachable
from tooling (`mesh-viewer`, `terrain-editor`) — never in gameplay.

### 2.2 Four spawn paths, each deciding appearance differently (the "all over the map" bug)
Appearance is resolved inconsistently at each call site:
- `client/src/core/WebSocketHandler.ts:87` (online join) — passes **no** `style` at all.
- `client/src/systems/WorldGenerator.ts:232` (manifest) — passes `npcDef.ai.style`.
- `client/src/systems/ProceduralPopulator.ts:281` (procedural).
- `client/src/systems/DungeonSystem.ts:257` (dungeon).

So the same NPC can look different depending on **how** it was spawned. There is no single
source of truth.

### 2.3 Coupling
`NPC` imports and hard-wires `NPCAppearance`, `NPCAccessories`, PBR — the entity knows how
a body is built. Swapping/adding mesh types means editing the entity. Not maintainable.

---

## 3. Target Architecture (decoupled)

Three layers, one decision point. The `NPC` entity stops knowing how skins are made.

```
ServerNPC / ManifestNPC / Procedural spawn
        │  (identity only: id, name, role, optional appearance fields)
        ▼
┌─────────────────────────────┐
│ NPCAppearanceResolver (pure) │  identity → AppearanceSpec
│  no THREE.js, unit-testable  │  { meshType, palette?, scale? }
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ NPCMeshFactory (THREE.js)    │  AppearanceSpec → { object3D, materials }
│  ONE path: buildMesh(type)   │  procedural is just another registered mesh
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ NPC entity                   │  consumes object3D + materials only.
│  movement / nameplate / HP   │  no appearance knowledge.
└─────────────────────────────┘
```

**Key insight that makes this clean:** `meshes/npcs/index.ts` *already* registers the
procedural styles as `npc_style_<style>` meshes that internally call
`buildProceduralMesh()`. So once the entity goes through `buildMesh(type)`, **procedural
and custom meshes unify behind one registry call** — the entity has a single code path and
zero branching. Procedural becomes an implementation detail of the registry, not the entity.

### 3.1 `NPCAppearanceResolver` — single source of truth
`resolveAppearance(identity): AppearanceSpec`

Resolution priority (highest → lowest):
1. Explicit `appearance.mesh` from manifest/server (authored override).
2. `npc_individual_<id>` if registered → use it (unique authored NPCs).
3. `npc_style_<style>` if `style` provided (manifest/server).
4. Keyword inference (`getNPCPlaceholderStyle`) → `npc_style_<style>` fallback.

Pure function over a plain `NPCIdentity` (no THREE.js, no DOM). Every spawn path calls this
and **only** this. Fixes 2.2 by construction — appearance no longer depends on spawn source.

### 3.2 `NPCMeshFactory` — build + per-instance material collection
`build(spec, ctx): { object3D, materials }`
- Calls `buildMesh(spec.meshType, ctx)` (works for custom *and* procedural).
- Traverses the result to collect `MeshStandardMaterial`s (for highlight/tint), decoupled
  from how the mesh was authored.
- Clones color-bearing materials per instance so highlight/tint don't bleed across the
  shared registry cache (current `setHighlight` bug).
- Applies optional `palette` from the spec.

### 3.3 `NPC` entity — slim
Constructor takes the `{ object3D, materials }` from the factory. Deletes direct imports of
`NPCAppearance`/`buildProceduralMesh`. Keeps nameplate, action icon, animator, wander,
`userData` tagging, `setHighlight` (now operating on per-instance materials).

---

## 4. Will this fix "right skins all over the map"?

**Yes.** After Phase 1+2:
- Every spawn path (online, manifest, procedural, dungeon) routes through the **same**
  resolver → identical NPC looks identical everywhere.
- `npc_individual_<id>` meshes are selected automatically → authored unique NPCs show their
  real skins.
- Online-join NPCs (which today pass no style) get correct meshes via the resolver instead
  of silent generic fallback.

---

## 5. Phases

### Phase 1 — Resolver + factory, route ALL spawns through them (FE) ⭐ core fix
- New `client/src/entities/npc/NPCAppearanceResolver.ts` (pure, `resolveAppearance`).
- New `client/src/entities/npc/NPCMeshFactory.ts` (`build` → `{object3D, materials}`).
- `NPC.ts`: constructor consumes factory output; remove direct appearance imports.
- `EntityManager.addNPC()`: accept `NPCIdentity`, call resolver+factory once, pass result
  to `NPC`. All four spawn sites now pass identity only — no per-site appearance logic.
- **Verification:** Nireg/Aurelia/El Tito show authored meshes; same NPC looks identical
  whether spawned via online join, manifest, or procedural.

### Phase 2 — Kill material-sharing bleed (FE)
- In `NPCMeshFactory`, clone color/emissive-bearing materials per instance (keep geometry
  shared — cheap and safe).
- `NPC.setHighlight()` mutates only per-instance clones.
- **Verification:** highlight one NPC → same-style neighbors stay unlit.

### Phase 3 — Per-NPC variety so crowds aren't clones (FE)
- Resolver passes a stable `seed` (hash of id) into the spec; factory feeds it to the
  procedural builder so the existing-but-dead `varyColor` path activates (today `seed`
  is always 0 because the mesh group has no name — `NPCAppearance.ts:72`, `NPC.ts:61`).
- Optional seed-based scale jitter + accessory variants (`NPCAccessories.ts`).
- **Verification:** a crowd of `civilian`/`merchant` shows visible color/scale variety.

### Phase 4 — Manifest/server-driven appearance (BE + shared)
Make appearance authorable, not just inferred — so adding a skin needs no code change.
- `shared/data/world_manifest.json`: optional per-NPC `appearance { mesh?, style?, palette?, scale? }`.
- `server/src/world/npc_definitions.py`: surface those fields (backward compatible — absent → inferred).
- `server/src/ws/` NPC list payload: include the appearance fields.
- `client/src/core/WebSocketHandler.ts`: pass them into the spawn identity (today it passes none).
- **Verification:** set `mesh`/`palette` on an NPC in the manifest → renders accordingly in
  every mode with no client code change.

### Phase 5 — Content pass (BE, optional)
- Author custom meshes / palette overrides for marquee NPCs.
- Audit keyword rules in `NPCModels.ts` for mis-routed NPCs.
- Idle-emote variety hooks for liveliness.

---

## 6. Affected Files

**Frontend**
- NEW `client/src/entities/npc/NPCAppearanceResolver.ts` — pure resolution (P1)
- NEW `client/src/entities/npc/NPCMeshFactory.ts` — build + material handling (P1,P2)
- `client/src/entities/NPC.ts` — slim entity, consumes factory output (P1,P2)
- `client/src/entities/NPCModels.ts` — reused by resolver for keyword inference (P1)
- `client/src/entities/EntityManager.ts` — resolve+build once, identity-only API (P1)
- `client/src/entities/NPCAppearance.ts` — accept external seed; stays behind factory (P3)
- `client/src/entities/NPCAccessories.ts` — seed-based variants (P3)
- `client/src/core/WebSocketHandler.ts`, `systems/WorldGenerator.ts`,
  `systems/ProceduralPopulator.ts`, `systems/DungeonSystem.ts` — pass identity, drop
  per-site appearance logic (P1,P4)

**Backend / shared**
- `shared/data/world_manifest.json` — per-NPC `appearance` block (P4,P5)
- `server/src/world/npc_definitions.py` — surface appearance fields (P4)
- `server/src/ws/` protocol + NPC list payload (P4)

---

## 7. Maintainability Wins

- **Single source of truth:** appearance decided in one pure function, not 4 spawn sites.
- **Open/closed:** add a new NPC skin by registering a mesh + (optionally) a manifest entry —
  no entity edits.
- **Unified build path:** custom and procedural meshes both go through `buildMesh`; entity
  has zero branching.
- **Testable:** resolver is a pure function (Vitest, no THREE.js); factory output contract
  (`{object3D, materials}`) is easy to assert.
- **No shared-state bugs:** per-instance materials remove highlight/tint bleed.

---

## 8. Tests

- **Vitest:** resolver priority order (mesh > individual > style > keyword); same identity →
  same spec regardless of spawn source; factory returns distinct material instances per build.
- **pytest:** `load_npc_definitions()` surfaces `appearance` when present, omits cleanly when
  absent (backward compat).
- **Manual:** `make check`; run client+server; confirm authored NPCs render correctly in
  online + procedural modes; highlight bleed gone.
