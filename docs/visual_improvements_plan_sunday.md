---
date: 2026-05-31T13:50:33Z
git_commit: 2adea1f40231b4e93e0a76edad47ceafa5892272
branch: main
topic: "Mesh Scaffold Completeness + World Debug Visualizer"
tags: [plan, meshes, visualizer, debug, world-builder, three.js]
status: draft
---

# Mesh Scaffold Completeness + World Debug Visualizer — Implementation Plan

## Overview

Two parallel improvements that together make the game's 3D world easier to build and debug:

1. **Mesh Scaffold Completeness** — Wrap the 9 hand-coded encounter set-pieces (campsite, bandit camp, etc.) as proper `Mesh` subclasses in the registry so they appear in the mesh viewer. Also upgrade the mesh viewer from a single-item dropdown to a category-filtered grid that shows bounding-box metadata.

2. **World Debug Visualizer** — A toggleable overlay (F3 key) rendered via `CSS2DRenderer` that labels every placed object in the live game scene with its world XYZ, plus a mouse-hover panel showing type, mesh name, bounding box, and zone/biome. Integrated cleanly into `GameEngine.ts` without touching the main render loop.

---

## Current State Analysis

### Mesh scaffold (complete for game types)

All types in `worldbuilder/objects/index.ts:ObjectType`, all `BIOME_BUILDINGS`, `BIOME_PROPS`, `BIOME_VEGETATION`, and all `world_manifest.json` object types are already registered:

| Category | Count | Files |
|---|---|---|
| Malaka buildings | 11 | `meshes/buildings/malaka/` |
| Generic structures | 9 | `meshes/buildings/structures/` |
| Biome buildings | 20 | `meshes/buildings/biome/` |
| Props (standalone) | 3 | `meshes/props/` |
| Biome props | 23 | `meshes/props/biome/` |
| Vegetation | 3 | `meshes/vegetation/` |
| **Total registered** | **69** | |

### Gap — encounter set-pieces (9 builders)

These builder functions in `client/src/systems/worldbuilder/objects/encounterBuilders.ts` build geometry inline using Three.js primitives. They are **not** registered as `Mesh` subclasses and therefore do **not** appear in the mesh viewer:

- `buildCampsite` → would become `encounter_campsite`
- `buildBanditCamp` → `encounter_bandit_camp`
- `buildMerchantCaravan` → `encounter_merchant_caravan`
- `buildHermitDwelling` → `encounter_hermit_dwelling`
- `buildMineEntrance` → `encounter_mine_entrance`
- `buildBattlefieldRemnant` → `encounter_battlefield_remnant`
- `buildFishingSpot` → `encounter_fishing_spot`
- `buildRitualSite` → `encounter_ritual_site`
- `buildCrashedWagon` → `encounter_crashed_wagon`

### Gap — mesh viewer is a basic single-item dropdown

`client/mesh-viewer.html` + `client/src/mesh-viewer.ts`: one `<select>`, shows one mesh at a time. No category filter, no grid, no bounding-box info.

### World Visualizer — does not exist

- `CSS2DRenderer` is not imported or used anywhere in the client.
- Placed objects carry no debug metadata (`userData` is used for `isCollider`/`noCollision`/`distanceShadowCaster` but not for debug info).
- `GameEngine.ts:animate()` is the right hook — after all system updates, before the render call in `SceneManager.tick()`.

---

## Desired End State

### Mesh Viewer

```
┌──────────────────────────────────────────────────────────────────┐
│  Mesh Visualizer                    [Filter: All ▼]  [Grid/Solo] │
│  Search: _______________                                          │
├──────────────────────────────────────────────────────────────────┤
│  BUILDINGS (40)  ·  PROPS (26)  ·  VEGETATION (3)                │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │[3D mesh] │  │[3D mesh] │  │[3D mesh] │  │[3D mesh] │  ...    │
│  │malaka_   │  │malaka_   │  │moonwell  │  │campsite  │         │
│  │church    │  │castle    │  │struct    │  │encounter │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
└──────────────────────────────────────────────────────────────────┘
```

- Clicking a tile enters "solo" mode (current orbit-controls view)
- Hovering a tile shows bounding box dimensions
- The 9 encounter meshes appear under the `encounter` sub-category

### World Visualizer (in-game)

```
┌─── F3 Debug Overlay (when active) ─────────────────────────────┐
│  [Label]  malaka_church                                         │
│           x: 145.2  y: 3.8  z: -88.6                           │
│                                                                 │
│  [Label]  biome_elven_tower                                     │
│           x: -300.1  y: 12.4  z: 201.8                         │
│                                                                 │
│  On hover:  ┌──────────────────────────────────────────────┐   │
│             │  type:     malaka_church                     │   │
│             │  category: building                          │   │
│             │  zone:     Malaka                            │   │
│             │  bbox:     8.0 × 12.0 × 8.0                 │   │
│             │  pos:      (145.2, 3.8, -88.6)              │   │
│             └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

- F3 toggles the entire overlay on/off
- Labels float above every placed object (WorldBuilder + ProceduralPopulator)
- Mouseover tooltip shows rich debug info
- Performance: labels are pooled / culled by distance (max visible radius = 300 units)

---

## What We're NOT Doing

- Not migrating encounter geometry away from `encounterBuilders.ts` — we wrap it, not rewrite it
- Not adding editor-mode placement via the visualizer (that's for a separate tool-mode feature)
- Not converting the mesh viewer into a standalone Electron or web app
- Not adding physics debug wireframes (that belongs in a future CollisionSystem visualizer)
- Not changing how encounters are registered in `EncounterRegistry` — only wrapping their geometry as `Mesh` types

---

## Implementation Approach

Minimal changes: wrap existing builder functions instead of rewriting them, add `userData.debugInfo` at the placement callsites, then build `WorldDebugOverlay.ts` as a self-contained module that hooks into `GameEngine`.

---

## Architecture and Code Reuse

```
client/src/
  meshes/
    encounters/                   ← NEW: 9 encounter wrappers
      Campsite.ts                 ← wraps buildCampsite()
      BanditCamp.ts
      MerchantCaravan.ts
      HermitDwelling.ts
      MineEntrance.ts
      BattlefieldRemnant.ts
      FishingSpot.ts
      RitualSite.ts
      CrashedWagon.ts
      index.ts                    ← side-effect imports (adds to registry)
    index.ts                      ← add: import './encounters'

  debug/                          ← NEW directory
    WorldDebugOverlay.ts          ← CSS2DRenderer labels + hover panel
    DebugInfo.ts                  ← shared userData.debugInfo type

  core/
    GameEngine.ts                 ← add WorldDebugOverlay wiring + F3 toggle

  systems/
    ProceduralPopulator.ts        ← add userData.debugInfo tag at spawn
    WorldBuilder.ts               ← add userData.debugInfo tag at spawn

mesh-viewer.ts                    ← upgrade: category tabs, grid mode, search
mesh-viewer.html                  ← upgrade: layout for grid
```

**Third-party libs already available (no new deps):**
- `three/examples/jsm/renderers/CSS2DRenderer.js` — ships with Three.js, not yet imported
- `three/examples/jsm/renderers/CSS3DRenderer.js` — alternative (CSS2D is lighter, preferred)

---

## Phase 1: Wrap Encounter Set-Pieces as Mesh Classes

### Overview
Create 9 thin wrapper `Mesh` subclasses in `client/src/meshes/encounters/` that delegate `build()` to the existing `encounterBuilders.ts` functions. Register them all so they appear in the mesh viewer.

### Changes Required

#### [ ] 1. Create `client/src/meshes/encounters/` directory with 9 wrapper files

**File**: `client/src/meshes/encounters/Campsite.ts`  
**Pattern** (repeat for each encounter):
```ts
import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { buildCampsite } from '../../../systems/worldbuilder/objects/encounterBuilders';

export class Campsite extends Mesh {
  static readonly type = 'encounter_campsite';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const anchor = ctx.position.clone();
    // encounterBuilders expect a seeded Rng; pass a no-op stub for viewer
    const rng = ctx.rng ?? { next: () => 0.5, nextInt: () => 0, nextRange: (lo: number) => lo, chance: () => false, pick: <T>(a: T[]) => a[0]! };
    const group = buildCampsite(anchor, rng);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(Campsite);
```

Nine files total with these type strings:
| File | `type` |
|---|---|
| `Campsite.ts` | `encounter_campsite` |
| `BanditCamp.ts` | `encounter_bandit_camp` |
| `MerchantCaravan.ts` | `encounter_merchant_caravan` |
| `HermitDwelling.ts` | `encounter_hermit_dwelling` |
| `MineEntrance.ts` | `encounter_mine_entrance` |
| `BattlefieldRemnant.ts` | `encounter_battlefield_remnant` |
| `FishingSpot.ts` | `encounter_fishing_spot` |
| `RitualSite.ts` | `encounter_ritual_site` |
| `CrashedWagon.ts` | `encounter_crashed_wagon` |

#### [ ] 2. Create `client/src/meshes/encounters/index.ts`

**File**: `client/src/meshes/encounters/index.ts`
```ts
import './Campsite';
import './BanditCamp';
import './MerchantCaravan';
import './HermitDwelling';
import './MineEntrance';
import './BattlefieldRemnant';
import './FishingSpot';
import './RitualSite';
import './CrashedWagon';
```

#### [ ] 3. Add encounter import to `client/src/meshes/index.ts`

**File**: `client/src/meshes/index.ts`  
**Change**: Add `import './encounters';` after the existing `import './vegetation';` line.

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes with no errors
- [ ] `cd client && npm run lint` passes
- [ ] `meshTypes()` returns 78 types (69 existing + 9 new encounter types)

#### Manual Verification:
- [ ] Open `http://localhost:5173/mesh-viewer.html`, dropdown shows `encounter_campsite`, `encounter_bandit_camp`, etc.
- [ ] Selecting `encounter_campsite` renders the campsite geometry with orbit controls

---

## Phase 2: Add Debug Metadata to Placed Objects

### Overview
Enrich placed `THREE.Object3D` instances with a `userData.debugInfo` object at placement time. This powers the world visualizer in Phase 3.

### Changes Required

#### [ ] 1. Create `client/src/debug/DebugInfo.ts`

**File**: `client/src/debug/DebugInfo.ts`
```ts
export interface DebugInfo {
  type: string;       // mesh type string e.g. "malaka_church"
  category: string;   // "building" | "prop" | "vegetation" | "encounter"
  label?: string;     // optional authored label
  zone?: string;      // zone/biome name at spawn time (e.g. "Teldrassil")
}

/** Attach debug info to a Three.js object and all its descendants. */
export function tagDebugInfo(obj: THREE.Object3D, info: DebugInfo): void {
  obj.userData.debugInfo = info;
}
```

#### [ ] 2. Tag objects in `WorldBuilder.spawnObject()`

**File**: `client/src/systems/WorldBuilder.ts`  
**Change**: After `buildObject(...)` succeeds, call `tagDebugInfo(group, { type, category: 'building', label })`.

```ts
import { tagDebugInfo } from '../debug/DebugInfo';
// ...
const builtGroup = buildObject(params.objectType, pos, scale, label);
if (!builtGroup) return undefined;
tagDebugInfo(builtGroup, { type: params.objectType, category: 'building', label: params.label });
```

#### [ ] 3. Tag objects in `ProceduralPopulator._populate()`

**File**: `client/src/systems/ProceduralPopulator.ts`  
**Change**: After each `buildMesh(...)` / `registryEntry.buildingFn(...)` call returns a non-null object, call `tagDebugInfo(obj, { type, category, zone: BiomeType[biome] })`.

Locations:
- Line ~324 (building spawn)
- Line ~379 (vegetation spawn)
- Line ~410 (ambient prop spawn)

#### [ ] 4. Tag encounter group objects

**File**: `client/src/systems/ProceduralPopulator.ts`  
**Change**: After `enc.buildFn(anchor, rng)` at line ~272, add:
```ts
tagDebugInfo(group, { type: `encounter_${enc.id}`, category: 'encounter', zone: BiomeType[biome] });
```

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes
- [ ] `cd client && npm run test` passes (no regressions in WorldGenerator or Integration tests)

---

## Phase 3: World Debug Visualizer

### Overview
Build `WorldDebugOverlay.ts` — a self-contained module using `CSS2DRenderer` that renders world-space coordinate labels above every tagged object, with a hover panel showing rich debug info. Toggle with F3.

### Changes Required

#### [ ] 1. Create `client/src/debug/WorldDebugOverlay.ts`

**File**: `client/src/debug/WorldDebugOverlay.ts`
```ts
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { DebugInfo } from './DebugInfo';

const LABEL_CULL_DIST_SQ = 300 * 300;

export class WorldDebugOverlay {
  private css2dRenderer: CSS2DRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private labels: CSS2DObject[] = [];
  private hoverPanel: HTMLDivElement;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-9999, -9999);
  private enabled = false;
  private container: HTMLElement;

  constructor(
    container: HTMLElement,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;

    // CSS2D renderer — overlays on top of WebGL canvas
    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
    this.css2dRenderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;pointer-events:none;';
    container.appendChild(this.css2dRenderer.domElement);

    // Hover panel (hidden by default)
    this.hoverPanel = document.createElement('div');
    Object.assign(this.hoverPanel.style, {
      position: 'absolute', padding: '8px 12px', background: 'rgba(0,0,0,0.75)',
      color: '#ddeeff', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6',
      borderRadius: '6px', border: '1px solid rgba(100,160,255,0.4)',
      pointerEvents: 'none', display: 'none', zIndex: '9999',
    });
    container.appendChild(this.hoverPanel);

    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('resize', this.onResize.bind(this));
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.css2dRenderer.domElement.style.display = this.enabled ? 'block' : 'none';
    if (!this.enabled) this.hoverPanel.style.display = 'none';
    if (this.enabled) this.rebuildLabels();
    else this.clearLabels();
  }

  get isEnabled(): boolean { return this.enabled; }

  /** Call from GameEngine.animate() after all system updates. */
  update(playerPosition: THREE.Vector3): void {
    if (!this.enabled) return;

    // Distance-cull labels
    for (const label of this.labels) {
      const obj = label.parent;
      if (!obj) continue;
      const dx = obj.position.x - playerPosition.x;
      const dz = obj.position.z - playerPosition.z;
      label.visible = (dx * dx + dz * dz) <= LABEL_CULL_DIST_SQ;
    }

    // Raycaster hover — check against labeled objects
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const taggedObjects = this.labels
      .filter(l => l.visible && l.parent)
      .map(l => l.parent!);
    const hits = this.raycaster.intersectObjects(taggedObjects, true);
    if (hits.length > 0) {
      let target: THREE.Object3D | null = hits[0]!.object;
      while (target && !target.userData.debugInfo) target = target.parent;
      if (target?.userData.debugInfo) {
        this.showHoverPanel(hits[0]!.point, target.userData.debugInfo as DebugInfo, target.position);
        return;
      }
    }
    this.hoverPanel.style.display = 'none';

    this.css2dRenderer.render(this.scene, this.camera);
  }

  private rebuildLabels(): void {
    this.clearLabels();
    this.scene.traverse((obj) => {
      const info = obj.userData.debugInfo as DebugInfo | undefined;
      if (!info) return;
      const label = this.makeLabel(obj, info);
      obj.add(label);
      this.labels.push(label);
    });
  }

  private makeLabel(obj: THREE.Object3D, info: DebugInfo): CSS2DObject {
    const div = document.createElement('div');
    div.style.cssText =
      'background:rgba(0,0,0,0.55);color:#aaddff;padding:2px 6px;border-radius:4px;' +
      'font:10px monospace;white-space:nowrap;pointer-events:none;';
    const pos = obj.position;
    div.textContent = `${info.type}  (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
    const label = new CSS2DObject(div);
    label.position.set(0, 2, 0); // float 2 units above object origin
    return label;
  }

  private showHoverPanel(point: THREE.Vector3, info: DebugInfo, objPos: THREE.Vector3): void {
    const bbox = new THREE.Box3();
    // ... compute from object geometry
    this.hoverPanel.innerHTML = [
      `<b>${info.type}</b>`,
      `category: ${info.category}`,
      info.zone ? `zone: ${info.zone}` : '',
      info.label ? `label: ${info.label}` : '',
      `pos: (${objPos.x.toFixed(1)}, ${objPos.y.toFixed(1)}, ${objPos.z.toFixed(1)})`,
    ].filter(Boolean).join('<br>');
    this.hoverPanel.style.display = 'block';
    // Position near cursor — will be refined in implementation
  }

  private clearLabels(): void {
    for (const label of this.labels) label.parent?.remove(label);
    this.labels = [];
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.container.getBoundingClientRect();
    this.mouse.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    if (this.enabled && this.hoverPanel.style.display === 'block') {
      this.hoverPanel.style.left = `${e.clientX + 14}px`;
      this.hoverPanel.style.top = `${e.clientY - 10}px`;
    }
  }

  private onResize(): void {
    this.css2dRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  dispose(): void {
    this.clearLabels();
    this.css2dRenderer.domElement.remove();
    this.hoverPanel.remove();
  }
}
```

#### [ ] 2. Wire `WorldDebugOverlay` into `GameEngine.ts`

**File**: `client/src/core/GameEngine.ts`  
**Changes**:
- Import `WorldDebugOverlay`
- Add private `debugOverlay: WorldDebugOverlay | null = null`
- In constructor (after `wireCallbacks()`), initialize the overlay:
  ```ts
  this.debugOverlay = new WorldDebugOverlay(
    this.d.sceneManager.renderer.domElement.parentElement!,
    this.d.sceneManager.scene,
    this.d.sceneManager.camera,
  );
  ```
- Add F3 key handler in `wireCallbacks()`:
  ```ts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      this.debugOverlay?.toggle();
    }
  });
  ```
- In `animate()`, before the render call at the end:
  ```ts
  this.debugOverlay?.update(d.playerController.position);
  ```

#### [ ] 3. Upgrade Mesh Viewer (`client/src/mesh-viewer.ts`)

**File**: `client/src/mesh-viewer.ts`  
**Changes**:
- Add category-tab buttons (All / Buildings / Props / Vegetation / Encounters)
- Add text search input
- Add grid thumbnail mode: render each mesh to an `<img>` using `renderer.render()` + `toDataURL()`  
- Keep single-mesh solo mode with orbit controls (click on a tile to enter solo mode)
- Show bounding-box info (`width × height × depth`) below each thumbnail label

#### [ ] 4. Upgrade Mesh Viewer HTML (`client/mesh-viewer.html`)

**File**: `client/mesh-viewer.html`  
**Changes**:
- Add category tab bar
- Add search input
- Add grid container `#meshGrid` (CSS grid layout)
- Add solo view container `#soloView` (shows on tile click)

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes
- [ ] `cd client && npm run lint` passes

#### Manual Verification:
- [ ] Press F3 in the game — labels appear above all placed buildings, props, and vegetation
- [ ] Labels show correct type and XYZ coordinates
- [ ] Labels disappear for objects beyond 300 units
- [ ] Hovering a labeled object shows the tooltip with type/category/zone/pos
- [ ] Press F3 again — overlay fully disappears
- [ ] F3 does not interfere with normal game input (browser F3 shortcut suppressed)
- [ ] Open `http://localhost:5173/mesh-viewer.html` — category tabs visible
- [ ] Clicking "Encounters" tab shows all 9 encounter meshes in the grid
- [ ] Clicking a grid tile enters solo orbit-controls mode
- [ ] Search box filters tile list in real time

---

## Phase 4: NPC Debug Labels (Extension)

### Overview
Extend `WorldDebugOverlay` to also label NPCs with their id, name, HP, and facing direction — useful for debugging procedural spawn density and encounter NPCs.

### Changes Required

#### [ ] 1. Add `tagNpcDebugInfo()` in `EntityManager.addNPC()`

**File**: `client/src/entities/EntityManager.ts`  
**Change**: When a new NPC mesh is created, call `tagDebugInfo(npc.mesh, { type: npc.id, category: 'npc', label: npc.name })`.

#### [ ] 2. Extend hover panel for NPC info

**File**: `client/src/debug/WorldDebugOverlay.ts`  
**Change**: When hover hits an NPC-tagged object, additionally show `hp`, `maxHp`, and `state` from `userData.npcDebug` if present.

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes

#### Manual Verification:
- [ ] F3 shows NPC labels with id and name floating above NPC meshes

---

## Testing Strategy

### Unit Tests

None needed for Phase 1 (pure geometry wrapper — covered by typecheck). For Phase 3:
- [ ] `WorldDebugOverlay.toggle()` sets `enabled` correctly
- [ ] `clearLabels()` removes all `CSS2DObject` children
- [ ] Distance-cull logic correctly hides labels beyond threshold

### Integration Tests

No server-side changes. Client integration:
- [ ] `meshTypes()` returns 78 types after Phase 1 (baseline: 69 + 9)
- [ ] All encounter wrapper types build geometry without throwing

### Manual Testing Steps

1. Run `cd client && npm run dev`, open `http://localhost:5173`
2. Enter the game, wait for world to generate
3. Press F3 — verify floating labels appear above buildings/props
4. Walk toward a labeled malaka building, hover it — verify tooltip shows type + coordinates
5. Walk beyond 300 units from a labeled object — verify label disappears
6. Press F3 again — verify all labels gone
7. Open `http://localhost:5173/mesh-viewer.html`
8. Click "Encounters" tab — verify 9 encounter meshes in grid
9. Click `encounter_campsite` tile — verify full campsite geometry renders in solo view
10. Type "malaka" in search box — verify only malaka meshes show in grid

---

## Performance Considerations

- **CSS2DRenderer** adds a DOM-layer repaint on every frame while active. Since it's only on when F3 is pressed, this is acceptable for a debug tool.
- **Label pool**: labels are rebuilt once on `toggle()`, not every frame. Frame cost is only visibility updates (O(n) over spawned objects).
- **Raycaster hover** only runs against visible labeled objects (already culled), so cost is proportional to in-view object count (~100–300 at a time).
- **Thumbnail generation** in the mesh viewer is done once per mesh type into an `<img>` — no per-frame cost.
- Do NOT add the debug overlay to the production render path — `update()` returns immediately when `!this.enabled`.

---

## Migration Notes

- The 9 encounter wrapper types (`encounter_*`) are new type strings — they don't conflict with any existing type.
- `userData.debugInfo` is a new key — existing code that reads `userData.isCollider`/`noCollision` is unaffected.
- `CSS2DRenderer` renders into its own DOM element (absolute-positioned overlay) — it does not replace the `WebGLRenderer`.

---

## References

- Existing mesh scaffold: `client/src/meshes/` (all files)
- Encounter builders: `client/src/systems/worldbuilder/objects/encounterBuilders.ts`
- GameEngine render loop: `client/src/core/GameEngine.ts:263` (animate)
- Mesh viewer entry: `client/src/mesh-viewer.ts`, `client/mesh-viewer.html`
- Mesh refactor design doc: `docs/mesh-refactor-plan.md`
- Three.js CSS2DRenderer example: `node_modules/three/examples/jsm/renderers/CSS2DRenderer.js`
