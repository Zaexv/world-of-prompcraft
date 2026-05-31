---
date: 2026-05-31T13:55:01Z
git_commit: 2adea1f40231b4e93e0a76edad47ceafa5892272
branch: main
topic: "Mesh Scaffold Completeness + World Debug Visualizer"
tags: [plan, meshes, visualizer, debug, world-builder, three.js]
status: draft
---

# Mesh Scaffold Completeness + World Debug Visualizer — Implementation Plan

## Overview

Two parallel improvements that together make the game's 3D world easier to build and debug:

1. **Mesh Scaffold Completeness** — Wrap the 9 hand-coded encounter set-pieces (campsite, bandit camp, etc.) as proper `Mesh` subclasses so they appear in the mesh viewer. Upgrade the mesh viewer from a single-item dropdown to a category-filtered grid with bounding-box metadata.

2. **World Debug Visualizer** — A toggleable in-game overlay (F3 key) rendered via `CSS2DRenderer` that floats XYZ coordinate labels above every placed object, plus a mouse-hover panel showing type, mesh name, bounding box, and zone/biome. Integrated into `GameEngine.ts` without touching the main render path.

---

## Current State Analysis

### Mesh scaffold is complete for all game types

Every type string used by `ObjectType` (in `worldbuilder/objects/index.ts`), `BIOME_BUILDINGS`, `BIOME_PROPS`, `BIOME_VEGETATION`, and `world_manifest.json` is already registered in the catalog. Count as-shipped on `main`:

| Category | Registered types | Location |
|---|---|---|
| Malaka buildings | 11 | `meshes/buildings/malaka/` |
| Generic structures | 9 | `meshes/buildings/structures/` |
| Biome buildings | 20 | `meshes/buildings/biome/` |
| Standalone props | 3 | `meshes/props/` (Campfire, Bonfire, Lantern) |
| Biome props | 23 | `meshes/props/biome/` |
| Vegetation | 3 | `meshes/vegetation/` |
| **Total** | **69** | |

`ancient_tree_cluster` in the manifest is covered by `AncientTree.ts` via `static readonly aliases`.

### Gap — 9 encounter set-pieces are invisible to the mesh viewer

`client/src/systems/worldbuilder/objects/encounterBuilders.ts` contains 9 builder functions that create geometry inline using Three.js primitives. They are called by the `EncounterRegistry` at spawn time but are **not** `Mesh` subclasses and therefore do **not** appear in `meshTypes()` or the mesh viewer:

| Builder function | Proposed type string |
|---|---|
| `buildCampsite` | `encounter_campsite` |
| `buildBanditCamp` | `encounter_bandit_camp` |
| `buildMerchantCaravan` | `encounter_merchant_caravan` |
| `buildHermitDwelling` | `encounter_hermit_dwelling` |
| `buildMineEntrance` | `encounter_mine_entrance` |
| `buildBattlefieldRemnant` | `encounter_battlefield_remnant` |
| `buildFishingSpot` | `encounter_fishing_spot` |
| `buildRitualSite` | `encounter_ritual_site` |
| `buildCrashedWagon` | `encounter_crashed_wagon` |

### Gap — mesh viewer is a single-item dropdown

`client/mesh-viewer.html` + `client/src/mesh-viewer.ts`: one `<select>`, loads one mesh at a time. No category tabs, no grid, no search, no bounding-box readout.

### World Visualizer — does not exist yet

- `CSS2DRenderer` (ships with Three.js) is not imported anywhere in `client/src/`.
- Placed objects carry no debug metadata — `userData` is only used for `isCollider`, `noCollision`, `distanceShadowCaster`.
- `GameEngine.ts:animate()` (line 263) is the clean hook — runs after all system updates, before `sceneManager.tick()` renders.

---

## Desired End State

### Mesh Viewer — upgraded grid UI

```
┌────────────────────────────────────────────────────────────────────┐
│  Mesh Visualizer           Search: [___________]  [← Back to Game]│
│  [All] [Buildings] [Props] [Vegetation] [Encounters]               │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ [thumb]  │  │ [thumb]  │  │ [thumb]  │  │ [thumb]  │  ...      │
│  │malaka_   │  │moonwell  │  │campsite  │  │bandit_   │           │
│  │church    │  │          │  │encounter │  │camp      │           │
│  │ 8×12×8   │  │ 3×4×3    │  │ 6×3×6    │  │ 7×4×5    │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└────────────────────────────────────────────────────────────────────┘
```

- Clicking a tile enters full-screen solo orbit-controls mode (current behavior)
- Each tile shows an offline-rendered thumbnail, type string, and W×H×D bounding box
- Category tabs filter; search box narrows in real time

### World Visualizer (F3 in-game overlay)

```
 [World space labels — always visible when F3 is on]

      malaka_church
      145.2, 3.8, -88.6           ← CSS2DObject floating above object

      biome_elven_tower
      -300.1, 12.4, 201.8


 [Hover tooltip — appears on mouseover of any labeled object]
 ┌──────────────────────────────────────┐
 │ type:     malaka_church              │
 │ category: building                   │
 │ zone:     Malaka                     │
 │ bbox:     8.0 × 12.0 × 8.0          │
 │ pos:      145.2, 3.8, -88.6         │
 └──────────────────────────────────────┘
```

- F3 toggles the entire overlay on / off instantly
- Labels culled beyond 300 world units from the player (performance)
- Overlay does not affect the production render path when disabled

---

## What We're NOT Doing

- Not rewriting encounter geometry — we wrap builder functions, not replace them
- Not adding editor-mode drag-to-place via the visualizer (separate future tool-mode feature)
- Not adding physics/collision wireframe debug (belongs in a future CollisionSystem visualizer)
- Not changing `EncounterRegistry` registration — encounter type strings are new, not replacing existing IDs
- Not persisting debug overlay state across reloads

---

## Architecture and Code Reuse

```
client/src/
  meshes/
    encounters/                    ← NEW — 9 thin wrapper Mesh subclasses
      Campsite.ts
      BanditCamp.ts
      MerchantCaravan.ts
      HermitDwelling.ts
      MineEntrance.ts
      BattlefieldRemnant.ts
      FishingSpot.ts
      RitualSite.ts
      CrashedWagon.ts
      index.ts
    index.ts                       ← add: import './encounters'

  debug/                           ← NEW directory
    DebugInfo.ts                   ← shared interface + tagDebugInfo()
    WorldDebugOverlay.ts           ← CSS2DRenderer labels + hover panel

  core/
    GameEngine.ts                  ← add overlay wiring + F3 keydown handler

  systems/
    ProceduralPopulator.ts         ← tag spawned objects with debugInfo
    WorldBuilder.ts                ← tag spawned objects with debugInfo

client/
  mesh-viewer.ts                   ← upgrade: tabs, grid thumbnails, search
  mesh-viewer.html                 ← upgrade: layout for grid mode
```

**Third-party — no new package.json deps:**
- `three/examples/jsm/renderers/CSS2DRenderer.js` — ships with Three.js, not yet imported

---

## Phase 1: Register Encounter Set-Pieces as Mesh Types

### Overview

Create 9 thin `Mesh` subclasses in `client/src/meshes/encounters/`. Each `build()` delegates to the matching function in `encounterBuilders.ts` and passes a stub RNG so the mesh viewer gets a deterministic preview. Register all 9 so `meshTypes()` returns them and the viewer shows them.

### Changes Required

#### [ ] 1. Create `client/src/meshes/encounters/` with 9 wrapper files

**Pattern for all 9 files** (shown for `Campsite.ts`):

**File**: `client/src/meshes/encounters/Campsite.ts`
```ts
import * as THREE from 'three';
import { Mesh, type BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { buildCampsite } from '../../../systems/worldbuilder/objects/encounterBuilders';

const STUB_RNG = {
  next: () => 0.5,
  nextInt: () => 0,
  nextRange: (lo: number) => lo,
  chance: () => false,
  pick: <T>(a: readonly T[]): T => a[0]!,
};

export class Campsite extends Mesh {
  static readonly type = 'encounter_campsite';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = buildCampsite(ctx.position.clone(), ctx.rng ?? STUB_RNG);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(Campsite);
```

Nine files total:

| File | `type` string | Builder function |
|---|---|---|
| `Campsite.ts` | `encounter_campsite` | `buildCampsite` |
| `BanditCamp.ts` | `encounter_bandit_camp` | `buildBanditCamp` |
| `MerchantCaravan.ts` | `encounter_merchant_caravan` | `buildMerchantCaravan` |
| `HermitDwelling.ts` | `encounter_hermit_dwelling` | `buildHermitDwelling` |
| `MineEntrance.ts` | `encounter_mine_entrance` | `buildMineEntrance` |
| `BattlefieldRemnant.ts` | `encounter_battlefield_remnant` | `buildBattlefieldRemnant` |
| `FishingSpot.ts` | `encounter_fishing_spot` | `buildFishingSpot` |
| `RitualSite.ts` | `encounter_ritual_site` | `buildRitualSite` |
| `CrashedWagon.ts` | `encounter_crashed_wagon` | `buildCrashedWagon` |

#### [ ] 2. Create `client/src/meshes/encounters/index.ts`

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

#### [ ] 3. Add `import './encounters'` to `client/src/meshes/index.ts`

**File**: `client/src/meshes/index.ts`  
**Change**: Add the line `import './encounters';` after the existing `import './vegetation';`.

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes with 0 errors
- [ ] `cd client && npm run lint` passes
- [ ] Spot-check: `meshTypes().length === 78` (69 + 9 new encounter types)

#### Manual Verification:
- [ ] Open `http://localhost:5173/mesh-viewer.html`; dropdown includes `encounter_campsite`, `encounter_bandit_camp`, etc.
- [ ] Selecting `encounter_campsite` renders the full campsite geometry with orbit controls
- [ ] No orange fallback marker sphere appears for any encounter type

---

## Phase 2: Add Debug Metadata to Placed Objects

### Overview

Create a shared `DebugInfo` type and `tagDebugInfo()` helper. Call it from the three placement callsites: `WorldBuilder.spawnObject()`, `ProceduralPopulator._populate()` (building, vegetation, and prop branches), and the encounter spawn branch.

### Changes Required

#### [ ] 1. Create `client/src/debug/DebugInfo.ts`

**File**: `client/src/debug/DebugInfo.ts`
```ts
import * as THREE from 'three';

export interface DebugInfo {
  type: string;       // mesh type string, e.g. "malaka_church"
  category: string;   // "building" | "prop" | "vegetation" | "encounter" | "npc"
  label?: string;     // optional authored label from world manifest
  zone?: string;      // biome/zone name at spawn time, e.g. "Teldrassil"
}

/** Stamp debug info on an object. One call per placed root group. */
export function tagDebugInfo(obj: THREE.Object3D, info: DebugInfo): void {
  obj.userData.debugInfo = info;
}
```

#### [ ] 2. Tag objects in `WorldBuilder.spawnObject()`

**File**: `client/src/systems/WorldBuilder.ts`  
**Change**: Import `tagDebugInfo` and call it immediately after `buildObject(...)` returns a non-null group:
```ts
import { tagDebugInfo } from '../debug/DebugInfo';
// ...
const builtGroup = buildObject(params.objectType, pos, scale, label);
if (!builtGroup) return undefined;
tagDebugInfo(builtGroup, { type: params.objectType, category: 'building', label: params.label });
```

#### [ ] 3. Tag objects in `ProceduralPopulator._populate()`

**File**: `client/src/systems/ProceduralPopulator.ts`  
**Change**: Import `tagDebugInfo`; after each successful mesh build, tag before adding to scene.

Three locations within `_populate()`:
- **Building branch** (~line 324): `tagDebugInfo(building, { type, category: 'building', zone: BiomeType[biome] })`
- **Vegetation branch** (~line 379): `tagDebugInfo(veg, { type, category: 'vegetation', zone: BiomeType[biome] })`
- **Ambient prop branch** (~line 410): `tagDebugInfo(prop, { type, category: 'prop', zone: BiomeType[biome] })`
- **Encounter branch** (~line 272): `tagDebugInfo(group, { type: 'encounter_' + enc.id, category: 'encounter', zone: BiomeType[biome] })`

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes
- [ ] `cd client && npm run test` passes (no regressions in WorldGenerator / Integration tests)

---

## Phase 3: World Debug Visualizer

### Overview

`WorldDebugOverlay.ts` — a self-contained class using `CSS2DRenderer` (already bundled with Three.js). On `toggle()` it traverses the scene, attaches `CSS2DObject` labels to every object that has `userData.debugInfo`, and registers a raycaster for hover tooltips. The overlay adds zero cost to the render loop when disabled.

### Changes Required

#### [ ] 1. Create `client/src/debug/WorldDebugOverlay.ts`

**File**: `client/src/debug/WorldDebugOverlay.ts`
```ts
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { DebugInfo } from './DebugInfo';

const CULL_DIST_SQ = 300 * 300;

export class WorldDebugOverlay {
  private css2d: CSS2DRenderer;
  private labels: CSS2DObject[] = [];
  private hoverPanel: HTMLDivElement;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-9999, -9999);
  private _enabled = false;
  private _bbox = new THREE.Box3();
  private _bboxSize = new THREE.Vector3();

  constructor(
    private container: HTMLElement,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.css2d = new CSS2DRenderer();
    this.css2d.setSize(container.clientWidth, container.clientHeight);
    Object.assign(this.css2d.domElement.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none', display: 'none',
    });
    container.appendChild(this.css2d.domElement);

    this.hoverPanel = document.createElement('div');
    Object.assign(this.hoverPanel.style, {
      position: 'absolute', padding: '8px 12px', background: 'rgba(0,0,0,0.78)',
      color: '#cce8ff', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.7',
      borderRadius: '6px', border: '1px solid rgba(80,160,255,0.5)',
      pointerEvents: 'none', display: 'none', zIndex: '9999',
    });
    container.appendChild(this.hoverPanel);

    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('resize', this._onResize);
  }

  get isEnabled(): boolean { return this._enabled; }

  toggle(): void {
    this._enabled = !this._enabled;
    this.css2d.domElement.style.display = this._enabled ? 'block' : 'none';
    if (this._enabled) {
      this._buildLabels();
    } else {
      this._clearLabels();
      this.hoverPanel.style.display = 'none';
    }
  }

  /** Call from GameEngine.animate() after system updates, before sceneManager.tick(). */
  update(playerPos: THREE.Vector3): void {
    if (!this._enabled) return;

    // Distance-cull labels
    for (const lbl of this.labels) {
      if (!lbl.parent) continue;
      const p = lbl.parent.position;
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      lbl.visible = dx * dx + dz * dz <= CULL_DIST_SQ;
    }

    // Hover detection
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets = this.labels.filter(l => l.visible && l.parent).map(l => l.parent!);
    const hits = this.raycaster.intersectObjects(targets, true);
    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0]!.object;
      while (obj && !obj.userData.debugInfo) obj = obj.parent;
      if (obj?.userData.debugInfo) {
        this._showHover(obj, obj.userData.debugInfo as DebugInfo);
      }
    } else {
      this.hoverPanel.style.display = 'none';
    }

    this.css2d.render(this.scene, this.camera);
  }

  private _buildLabels(): void {
    this._clearLabels();
    this.scene.traverse((obj) => {
      const info = obj.userData.debugInfo as DebugInfo | undefined;
      if (!info) return;
      const div = document.createElement('div');
      Object.assign(div.style, {
        background: 'rgba(0,0,0,0.55)', color: '#88ccff',
        padding: '2px 6px', borderRadius: '4px',
        font: '10px monospace', whiteSpace: 'nowrap', pointerEvents: 'none',
      });
      const p = obj.position;
      div.textContent = `${info.type}  ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
      const lbl = new CSS2DObject(div);
      lbl.position.set(0, 2.5, 0);
      obj.add(lbl);
      this.labels.push(lbl);
    });
  }

  private _showHover(obj: THREE.Object3D, info: DebugInfo): void {
    this._bbox.setFromObject(obj);
    this._bbox.getSize(this._bboxSize);
    const p = obj.position;
    const lines = [
      `<b>${info.type}</b>`,
      `category: ${info.category}`,
      info.zone   ? `zone:     ${info.zone}`   : '',
      info.label  ? `label:    ${info.label}`  : '',
      `pos:      ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
      `bbox:     ${this._bboxSize.x.toFixed(1)} × ${this._bboxSize.y.toFixed(1)} × ${this._bboxSize.z.toFixed(1)}`,
    ].filter(Boolean).join('<br>');
    this.hoverPanel.innerHTML = lines;
    this.hoverPanel.style.display = 'block';
  }

  private _clearLabels(): void {
    for (const lbl of this.labels) lbl.parent?.remove(lbl);
    this.labels = [];
  }

  private _onMouseMove = (e: MouseEvent): void => {
    const r = this.container.getBoundingClientRect();
    this.mouse.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    if (this._enabled && this.hoverPanel.style.display === 'block') {
      this.hoverPanel.style.left = `${e.clientX + 16}px`;
      this.hoverPanel.style.top  = `${e.clientY - 8}px`;
    }
  };

  private _onResize = (): void => {
    this.css2d.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  dispose(): void {
    this._clearLabels();
    this.css2d.domElement.remove();
    this.hoverPanel.remove();
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('resize', this._onResize);
  }
}
```

#### [ ] 2. Wire `WorldDebugOverlay` into `GameEngine.ts`

**File**: `client/src/core/GameEngine.ts`  

Add import at top:
```ts
import { WorldDebugOverlay } from '../debug/WorldDebugOverlay';
```

Add private field:
```ts
private debugOverlay: WorldDebugOverlay | null = null;
```

Initialize in constructor, after `this.wireCallbacks()`:
```ts
const appContainer = this.d.sceneManager.renderer.domElement.parentElement;
if (appContainer) {
  this.debugOverlay = new WorldDebugOverlay(
    appContainer,
    this.d.sceneManager.scene,
    this.d.sceneManager.camera,
  );
}
```

Add F3 handler inside `wireCallbacks()`:
```ts
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'F3') {
    e.preventDefault();
    this.debugOverlay?.toggle();
  }
});
```

In `animate()`, immediately before `d.sceneManager.tick()` call (end of animate):
```ts
this.debugOverlay?.update(d.playerController.position);
```

#### [ ] 3. Upgrade `client/src/mesh-viewer.ts`

**Changes**:
- Add category tab buttons (`All | Buildings | Props | Vegetation | Encounters`)
- Add text `<input>` search box; filter tile list on `input` event
- Add grid layout: render each mesh to an offscreen canvas via `renderer.render()` → `toDataURL()` at 200×200, display as `<img>` tiles
- Keep existing solo orbit-controls view; clicking a tile hides grid and shows solo view
- Display bounding-box dimensions (`W×H×D`) under each tile label

#### [ ] 4. Upgrade `client/mesh-viewer.html`

**Changes**:
- Add `#tabBar` with category tab buttons
- Add `#searchInput` text field
- Add `#meshGrid` CSS-grid container (replaces `<select>`)
- Add `#soloView` container (shown on tile click, hidden by default)
- Update styles: grid layout, tile hover effect, active-tab highlight

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes
- [ ] `cd client && npm run lint` passes

#### Manual Verification:
- [ ] Press F3 in the game — coordinate labels appear above buildings, props, vegetation
- [ ] Labels correctly show `type  x, y, z` for a known placed malaka_church
- [ ] Labels disappear for objects beyond 300 units from the player
- [ ] Hover a labeled building — tooltip shows type, category, zone, pos, and W×H×D bbox
- [ ] Press F3 again — entire overlay disappears instantly (no leftover DOM elements)
- [ ] F3 suppresses default browser search bar (e.preventDefault confirmed)
- [ ] Open mesh viewer — 5 category tabs visible; "Encounters" tab shows 9 encounter tiles
- [ ] Clicking `encounter_campsite` tile renders full campsite in solo orbit-controls view
- [ ] Search `"malaka"` → only malaka_* tiles remain visible
- [ ] No regressions: normal gameplay inputs unaffected while F3 overlay is on

---

## Phase 4 (Extension): NPC Debug Labels

### Overview

Extend `WorldDebugOverlay` to also attach labels to NPC meshes so spawn density and placement are visible at a glance.

### Changes Required

#### [ ] 1. Tag NPC meshes in `EntityManager.addNPC()`

**File**: `client/src/entities/EntityManager.ts`  
**Change**: After the NPC mesh group is created, call:
```ts
tagDebugInfo(npc.mesh, { type: npc.id, category: 'npc', label: npc.name });
```

#### [ ] 2. Rebuild labels on NPC spawn / despawn

**File**: `client/src/debug/WorldDebugOverlay.ts`  
**Change**: Expose a `refresh()` method that calls `_clearLabels(); _buildLabels();`. GameEngine calls `debugOverlay?.refresh()` whenever `entityManager` fires its NPC-added/removed event.

### Success Criteria

#### Automated Verification:
- [ ] `cd client && npm run typecheck` passes

#### Manual Verification:
- [ ] F3 shows NPC id and name labels floating above every NPC mesh in range

---

## Testing Strategy

### Unit Tests

No new unit test files are required for the wrappers (pure delegation, covered by typecheck).  
For `WorldDebugOverlay`:
- [ ] `toggle()` correctly flips `isEnabled` and shows/hides the CSS2D DOM element
- [ ] `_clearLabels()` removes all `CSS2DObject` children from the scene
- [ ] Distance-cull maths: label at 301 units is hidden, at 299 is visible

### Integration Tests

- [ ] `meshTypes().length === 78` after Phase 1 wires in all encounter wrappers
- [ ] All 9 encounter wrapper `build()` calls return a `THREE.Group` without throwing

### Manual Testing Steps

1. `cd client && npm run dev`, open `http://localhost:5173`
2. Log in, walk into the world until a building spawns
3. Press F3 — labels appear; verify text matches a known malaka_church position
4. Walk 350 units away — label culls (disappears)
5. Hover a building — tooltip shows 6-line debug panel with bbox
6. Press F3 — overlay gone, game behaves normally
7. Open `http://localhost:5173/mesh-viewer.html`
8. Click "Encounters" tab — grid shows 9 encounter tiles with thumbnails
9. Click `encounter_ritual_site` — solo orbit-controls view renders ritual stone circle
10. Type `"tower"` in search — only tower-related meshes remain in grid

---

## Performance Considerations

- `CSS2DRenderer.render()` causes a DOM layer repaint every frame while active — acceptable for a debug tool (F3 only).
- Label `_buildLabels()` is O(scene objects) and runs **once** on `toggle()`, not per frame.
- Per-frame cost is O(visible labels) for cull check + one raycaster cast against culled objects.
- `toDataURL()` thumbnail generation runs once per mesh type on viewer load, not at runtime.
- The `debugOverlay?.update()` call in `animate()` returns in ~1µs when disabled (`if (!this._enabled) return`).

---

## Migration Notes

- The 9 new `encounter_*` type strings do not conflict with any existing type.
- `userData.debugInfo` is a new key — nothing reads or writes it today; zero breakage risk.
- `CSS2DRenderer` adds one `<div>` to the game container (absolute-positioned, pointer-events none) — does not interfere with existing UI z-stack.

---

## References

- Mesh scaffold entry point: `client/src/meshes/index.ts`
- Encounter builders: `client/src/systems/worldbuilder/objects/encounterBuilders.ts`
- GameEngine render loop: `client/src/core/GameEngine.ts:263` (`animate`)
- Mesh viewer: `client/src/mesh-viewer.ts`, `client/mesh-viewer.html`
- Mesh `Mesh` base class: `client/src/meshes/core/Mesh.ts`
- MeshRegistry: `client/src/meshes/core/MeshRegistry.ts`
- Prior mesh refactor design: `docs/mesh-refactor-plan.md`
- Three.js CSS2DRenderer: `node_modules/three/examples/jsm/renderers/CSS2DRenderer.js`
