---
date: 2026-06-04T14:27:57.955522+00:00
git_commit: 2982990a898a0f0cb36ce1bd26dab6531116c6e3
branch: fix/various-agentic-fixes
topic: "World Map — Full World View + Visual Improvements"
tags: [plan, minimap, world-map, ui, biomes, zones]
status: draft
---

# World Map — Full World View + Visual Improvements

## Overview

Extend the existing `Minimap` with a **World** / **Local** mode toggle. World mode renders the full known world (±600 units) centered at origin with zone region overlays and labels. Local mode keeps existing player-centered behavior. Visual quality improves in both modes via biome color blending and better zone label styling.

## Current State Analysis

- `client/src/ui/Minimap.ts` — 290×290px canvas, player-centered, scale=2.0 (shows ±290 world units). Already labeled "World Map" in title bar. No mode concept.
- Biome system: `getDominantBiome(x,z)` used for per-pixel color. Richer `getBiomeWeights(x,z)` exists and blends 6 biomes — currently unused in the map.
- `BIOME_COLORS` / `BIOME_NAMES` in `Minimap.ts` map `BiomeType` → hex color string.
- Zone data: 11 named zones in `client/src/systems/ZoneTracker.ts` (`ZONES[]`). Zone accent colors defined in `client/src/ui/ZoneDisplay.ts` (`ZONE_THEMES`).
- Known world bounds: finite named zones fit within ±400 units. Boundless zones (Crystal Tundra, Moin Swamps, etc.) extend to ±99999. World map will show ±600 units — captures all finite zones plus visible biome fringe.
- M key wired in `GameBootstrapper.ts:306` → `uiManager.toggleMinimap()` → `this.minimap.toggle()`.
- NPC dots pushed from `GameEngine.ts:358` via `minimap.setNPCDots()`. Waypoints from `WorldGenerator.ts:289` via `minimap.setWaypoints()`.

## Desired End State

Pressing M opens a map panel with two tabs in the title bar: **[World]** and **[Local]**.

- **World mode**: 500×500 canvas, origin-centered, shows ±600 world units. Zone regions drawn as semi-transparent fills with their accent color. Zone name labels overlaid at zone centers. Player shown as animated gold beacon at correct world position. NPC dots and waypoints rendered at world-scale positions.
- **Local mode**: existing 290×290 player-centered view (unchanged logic, visual improvements applied).

### UI Mockup

```
┌────────────────────────────────────────────────────────┐
│  WORLD MAP            [World] [Local]              [×] │
├────────────────────────────────────────────────────────┤
│                                                        │
│   ██████████████████████ Crystal Tundra ████████████   │
│   ██  Dark Forest  ███████████████████████████████     │
│   ██████████████  ┌─────────────────┐ ██████████████   │
│   ██ Crystal ██   │  Teldrassil     │   ██ Ember ██    │
│   ██  Lake   ██   │    Wilds   ★    │   ██ Peaks ██    │
│   ██████████████  └────────┬────────┘ ██████████████   │
│   ██████████████    Fort   │  Malaka  ████████████████ │
│   ████████████████████████ ● player ██████████████████ │
│   ████████████████ Moin Swamps █████████████████████   │
│                                                        │
├────────────────────────────────────────────────────────┤
│  N                x: 45  z: -120           Teldrassil  │
└────────────────────────────────────────────────────────┘
```

### Key Discoveries

- `getBiomeWeights(x,z)` (`Biomes.ts:195`) returns per-biome weights summing to 1 — can blend `BIOME_COLORS` for smoother gradient transitions at biome boundaries.
- `ZONES` array (`ZoneTracker.ts:34`) has all zone boundaries. Bounded finite zones fit ±400; boundless zones clamped to ±600 for rendering.
- `ZONE_THEMES` in `ZoneDisplay.ts:11` has accent hex strings per zone name — reuse for zone fill color.
- `Minimap.render()` sets `display:'flex'` in `onShow()` override — mode-switch canvas resize must preserve this.
- `onChunkLoaded` callback exists in `Terrain.ts:370` — not needed (world biome map is fully deterministic, no chunk dependency).

## What We're NOT Doing

- Fog-of-war / exploration tracking (user wants full world visible always).
- Minimap-as-always-on-HUD (stays toggle-based with M key).
- Zoom/pan controls (two fixed scales: world and local are enough).
- Server-side changes (all data is available client-side).
- Replacing or renaming the `Minimap` class (extend it in-place).

## Implementation Approach

All changes in `client/src/ui/Minimap.ts`. New public API is backwards-compatible — `GameEngine`, `GameBootstrapper`, `UIManager` need zero changes.

Biome pre-render: draw once to an offscreen `OffscreenCanvas` (or hidden `HTMLCanvasElement`) at world-map scale. Cache until invalidated. This makes world-mode rendering near-instant every frame (blit + overlays only).

Zone overlays: computed once from `ZONES[]` clamped to ±`WM_RANGE`. Zone fill = accent color at 20% alpha. Zone border = accent at 50% alpha, 1px. Label = Cinzel font, centered in clamped rect.

## Architecture and Code Reuse

```
client/src/ui/
  Minimap.ts          ← all changes here
    + viewMode: 'local' | 'world'
    + WM_MAP_SIZE = 500, WM_RANGE = 600, WM_SCALE = 2.4
    + _worldBiomeCanvas: HTMLCanvasElement (offscreen pre-render)
    + _worldBiomeDirty = true
    + mode toggle buttons (HTML elements in title bar)
    + _prerenderWorldBiomes(): void
    + _drawWorldView(playerX, playerZ): void
    + _drawZoneOverlays(ctx): void (world mode only)

client/src/systems/ZoneTracker.ts  ← read ZONES (no change)
client/src/ui/ZoneDisplay.ts       ← read ZONE_THEMES accent colors (no change)
```

Imports to add in `Minimap.ts`:
```ts
import { ZONES } from '../systems/ZoneTracker';
import { getBiomeWeights } from '../scene/Biomes';
```

No new files. No changes outside `Minimap.ts`.

---

## Phase 1: Mode Architecture + World View Core

### Overview

Add `viewMode` state, mode toggle buttons in title bar, resize canvas on switch, and implement the world-view draw pipeline with a pre-rendered biome texture.

### Changes Required

#### [ ] 1. New constants and state fields

**File**: `client/src/ui/Minimap.ts`

```ts
// Add after existing MM_SIZE / MM_SCALE constants:
const WM_MAP_SIZE = 500;          // world-mode canvas px
const WM_RANGE    = 600;          // world units visible from origin (±600)
const WM_SCALE    = (WM_RANGE * 2) / WM_MAP_SIZE; // 2.4 wu/px

// Add declare fields in the class body (after existing declares):
declare private modeWorldBtn: HTMLButtonElement;
declare private modeLocalBtn: HTMLButtonElement;
private viewMode: 'local' | 'world' = 'world';
private _worldBiomeCanvas: HTMLCanvasElement | null = null;
private _worldBiomeDirty = true;
```

#### [ ] 2. Mode toggle buttons in `render()`

**File**: `client/src/ui/Minimap.ts`

In `render()`, replace the single `titleText` append block to also add the two tab buttons in the title bar:

```ts
// After titleText.textContent = 'World Map':
const modeBar = document.createElement('div');
// flex row, gap 4px

this.modeWorldBtn = document.createElement('button');
this.modeWorldBtn.textContent = 'World';
this.modeLocalBtn = document.createElement('button');
this.modeLocalBtn.textContent = 'Local';

this.modeWorldBtn.addEventListener('click', () => this._setMode('world'));
this.modeLocalBtn.addEventListener('click', () => this._setMode('local'));

// Styling: active tab = gold border, inactive = subdued
modeBar.appendChild(this.modeWorldBtn);
modeBar.appendChild(this.modeLocalBtn);
titleBar.appendChild(modeBar);
```

#### [ ] 3. `_setMode()` — resize canvas + refresh state

**File**: `client/src/ui/Minimap.ts`

```ts
private _setMode(mode: 'local' | 'world'): void {
  this.viewMode = mode;
  const size = mode === 'world' ? WM_MAP_SIZE : MM_SIZE;
  this.canvas.width = size;
  this.canvas.height = size;
  this.canvas.style.width  = `${size}px`;
  this.canvas.style.height = `${size}px`;
  this.container.style.width = `${size + 8}px`;
  // Reset throttle so next update() redraws immediately
  this.lastDrawX = NaN;
  this._updateModeButtons();
}

private _updateModeButtons(): void {
  const activeStyle  = 'rgba(197,165,90,0.9)'; // gold
  const inactiveStyle = 'rgba(197,165,90,0.3)';
  this.modeWorldBtn.style.color = this.viewMode === 'world' ? activeStyle : inactiveStyle;
  this.modeLocalBtn.style.color = this.viewMode === 'local' ? activeStyle : inactiveStyle;
}
```

#### [ ] 4. World biome pre-render

**File**: `client/src/ui/Minimap.ts`

```ts
private _prerenderWorldBiomes(): void {
  const S = WM_MAP_SIZE;
  const scale = WM_SCALE;
  const step = 4; // 4px = ~9.6 world units — good quality at map scale

  if (!this._worldBiomeCanvas) {
    this._worldBiomeCanvas = document.createElement('canvas');
    this._worldBiomeCanvas.width  = S;
    this._worldBiomeCanvas.height = S;
  }
  const offCtx = this._worldBiomeCanvas.getContext('2d')!;
  offCtx.fillStyle = '#12141e';
  offCtx.fillRect(0, 0, S, S);

  for (let px = 0; px < S; px += step) {
    for (let py = 0; py < S; py += step) {
      const wx = (px - S / 2) * scale;   // world X (origin at canvas centre)
      const wz = (py - S / 2) * scale;   // world Z
      // Blend BIOME_COLORS by weights for smoother transitions:
      const weights = getBiomeWeights(wx, wz);
      let r = 0, g = 0, b = 0;
      for (const [biome, color] of BIOME_COLOR_COMPONENTS) {
        const w = weights[biome];
        if (w > 0.001) { r += color.r * w; g += color.g * w; b += color.b * w; }
      }
      offCtx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
      offCtx.fillRect(px, py, step, step);
    }
  }
  this._worldBiomeDirty = false;
}
```

Add a `BIOME_COLOR_COMPONENTS` constant (RGB decomposition of `BIOME_COLORS`) next to the existing `BIOME_COLORS` at the bottom of the file:
```ts
const BIOME_COLOR_COMPONENTS: Array<[BiomeType, {r:number,g:number,b:number}]> = 
  Object.entries(BIOME_COLORS).map(([biome, hex]) => {
    const n = parseInt(hex.slice(1), 16);
    return [Number(biome) as BiomeType, { r: (n>>16)&0xff, g: (n>>8)&0xff, b: n&0xff }];
  });
```

#### [ ] 5. `_drawWorldView()` — blit pre-render + player dot

**File**: `client/src/ui/Minimap.ts`

```ts
private _drawWorldView(playerX: number, playerZ: number): void {
  if (this._worldBiomeDirty) this._prerenderWorldBiomes();
  const ctx = this.ctx;
  const S = WM_MAP_SIZE;

  // Blit cached biome texture
  ctx.drawImage(this._worldBiomeCanvas!, 0, 0);

  // Zone overlays (phase 2)
  this._drawZoneOverlays(ctx);

  // NPC dots
  for (const npc of this.npcDots) {
    const nx = npc.x / WM_SCALE + S / 2;
    const nz = npc.z / WM_SCALE + S / 2;
    if (nx < -4 || nx > S + 4 || nz < -4 || nz > S + 4) continue;
    ctx.save();
    ctx.shadowColor = npc.hostile ? '#ff4444' : '#44ff88';
    ctx.shadowBlur = 4;
    ctx.fillStyle  = npc.hostile ? '#ff6644' : '#88ffaa';
    ctx.beginPath(); ctx.arc(nx, nz, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Waypoints
  for (const wp of this.waypoints) {
    const wx = wp.x / WM_SCALE + S / 2;
    const wy = wp.z / WM_SCALE + S / 2;
    if (wx < -12 || wx > S + 12 || wy < -12 || wy > S + 12) continue;
    this.drawWaypointMarker(ctx, wx, wy, wp.kind, false);
  }

  // Player beacon
  const px = playerX / WM_SCALE + S / 2;
  const pz = playerZ / WM_SCALE + S / 2;
  ctx.save();
  ctx.shadowColor = '#ffd966'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffd966';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(px, pz, 5, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Compass
  this._drawCompass(ctx, S);
}
```

#### [ ] 6. Route `update()` to correct mode

**File**: `client/src/ui/Minimap.ts`

In the existing `update(playerX, playerZ, playerAngle)`:
```ts
// After throttle check, before existing terrain draw:
if (this.viewMode === 'world') {
  const ctx = this.ctx;
  ctx.clearRect(0, 0, WM_MAP_SIZE, WM_MAP_SIZE);
  this._drawWorldView(playerX, playerZ);
  this.coordLabel.textContent = `x: ${Math.round(playerX)}  z: ${Math.round(playerZ)}`;
  this.biomeLabel.textContent = BIOME_NAMES[getDominantBiome(playerX, playerZ)] ?? '—';
  return;
}
// existing local-view code follows unchanged
```

### Success Criteria

#### Automated Verification:
- [ ] `rtk tsc` passes — no new type errors
- [ ] `rtk vitest` passes — existing Minimap field tests unchanged

#### Manual Verification:
- [ ] Press M → World tab active, 500×500 canvas shows full world biome colors centered at origin
- [ ] Player beacon visible at correct world position (moves as you walk)
- [ ] Switch to Local tab → 290×290 player-centered view restores
- [ ] NPC dots appear in world view at correct positions

---

## Phase 2: Zone Overlays

### Overview

Draw semi-transparent zone region fills and name labels on the world-mode canvas. Uses zone accent colors from `ZoneDisplay.ts` and zone bounds from `ZoneTracker.ts`.

### Changes Required

#### [ ] 1. Import zone data

**File**: `client/src/ui/Minimap.ts`

```ts
import { ZONES } from '../systems/ZoneTracker';
```

Add `ZONE_ACCENT_COLORS` constant (extracted from `ZoneDisplay.ts` ZONE_THEMES, co-located in Minimap.ts to avoid circular imports):

```ts
const ZONE_ACCENT_COLORS: Record<string, string> = {
  "Blasted Suarezlands": "#cc88ff",
  "Fort Malaka":         "#ffdd88",
  "Elders' Village":     "#88ffcc",
  "Dark Forest":         "#55dd55",
  "Ember Peaks":         "#ff7733",
  "Crystal Lake":        "#66ddff",
  "Crystal Tundra":      "#aaeeff",
  "Moin Swamps":         "#66bb44",
  "Malaka Area":         "#eecc44",
  "Teldrassil Wilds":    "#9966ff",
};
const ZONE_DEFAULT_ACCENT = "#c5a55a";
```

#### [ ] 2. `_drawZoneOverlays()`

**File**: `client/src/ui/Minimap.ts`

```ts
private _drawZoneOverlays(ctx: CanvasRenderingContext2D): void {
  const S  = WM_MAP_SIZE;
  const sc = WM_SCALE;          // world-units per pixel
  const toCanvasX = (wx: number) => wx / sc + S / 2;
  const toCanvasZ = (wz: number) => wz / sc + S / 2;
  const CLAMP = WM_RANGE;

  // Draw largest zones first (background) → smallest last (foreground labels)
  const sorted = [...ZONES].sort((a, b) =>
    (b.maxX - b.minX) * (b.maxZ - b.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ)
  );

  for (const zone of sorted) {
    const accent = ZONE_ACCENT_COLORS[zone.name] ?? ZONE_DEFAULT_ACCENT;
    // Clamp boundless zones to visible range
    const x0 = Math.max(zone.minX, -CLAMP);
    const x1 = Math.min(zone.maxX,  CLAMP);
    const z0 = Math.max(zone.minZ, -CLAMP);
    const z1 = Math.min(zone.maxZ,  CLAMP);
    if (x1 <= x0 || z1 <= z0) continue;

    const cx0 = toCanvasX(x0), cx1 = toCanvasX(x1);
    const cz0 = toCanvasZ(z0), cz1 = toCanvasZ(z1);
    const cw = cx1 - cx0, ch = cz1 - cz0;

    // Semi-transparent fill
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = accent;
    ctx.fillRect(cx0, cz0, cw, ch);
    ctx.restore();

    // Border
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(cx0 + 0.5, cz0 + 0.5, cw - 1, ch - 1);
    ctx.restore();

    // Name label — only if rect is at least 30px wide
    if (cw >= 30 && ch >= 14) {
      const labelX = (cx0 + cx1) / 2;
      const labelZ = (cz0 + cz1) / 2;
      ctx.save();
      ctx.font = 'bold 9px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 4;
      ctx.fillText(zone.name.toUpperCase(), labelX, labelZ);
      ctx.restore();
    }
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] `rtk tsc` passes

#### Manual Verification:
- [ ] World view shows colored zone regions with correct shapes and positions
- [ ] Zone names legible on each region
- [ ] Teldrassil Wilds (large rect) and Elders' Village (small inner rect) both visible simultaneously
- [ ] Boundless zones (Crystal Tundra, Moin Swamps) show as colored strips at the map edges

---

## Phase 3: Visual Quality Improvements

### Overview

Apply visual polish: improve biome color blending in Local mode (use weight-blended colors instead of dominant), add vignette to world view, improve player beacon pulse animation, clean up footer legend.

### Changes Required

#### [ ] 1. Blended biome colors in Local mode

**File**: `client/src/ui/Minimap.ts`

In the existing local-mode terrain render loop (the `for px / for py` loop in `update()`):

```ts
// Replace:
const biome = getDominantBiome(wx, wz);
ctx.fillStyle = BIOME_COLORS[biome];

// With (weight-blend like the world pre-render):
const weights = getBiomeWeights(wx, wz);
let r = 0, g = 0, b = 0;
for (const [biome, color] of BIOME_COLOR_COMPONENTS) {
  const w = weights[biome];
  if (w > 0.001) { r += color.r * w; g += color.g * w; b += color.b * w; }
}
ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
```

Note: local view loops `(290/6)² ≈ 2330` iterations at `step=6`. Each iteration now calls `getBiomeWeights` (cheap trig + sqrt) instead of `getDominantBiome` (same cost). No perf regression.

#### [ ] 2. Vignette on world view

**File**: `client/src/ui/Minimap.ts`

At end of `_drawWorldView()`, after all overlays:

```ts
// Edge vignette — darken corners
const vg = ctx.createRadialGradient(S/2, S/2, S*0.32, S/2, S/2, S*0.72);
vg.addColorStop(0, 'rgba(0,0,0,0)');
vg.addColorStop(1, 'rgba(0,0,0,0.45)');
ctx.fillStyle = vg;
ctx.fillRect(0, 0, S, S);
```

#### [ ] 3. Extract `_drawCompass()` helper

**File**: `client/src/ui/Minimap.ts`

Extract the existing compass drawing code from `update()` into a shared helper `_drawCompass(ctx, size)` called from both `update()` (local) and `_drawWorldView()` (world).

#### [ ] 4. Player beacon animation in world view

**File**: `client/src/ui/Minimap.ts`

Replace the static dot in `_drawWorldView()` with a pulsing ring:

```ts
// Use Date.now() for pulse — no extra state needed
const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
// Inner dot (static gold)
ctx.save();
ctx.shadowColor = '#ffd966'; ctx.shadowBlur = 8 + pulse * 6;
ctx.fillStyle = '#ffd966';
ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI * 2); ctx.fill();
// Outer ring (pulsing)
ctx.strokeStyle = `rgba(255,217,102,${0.3 + pulse * 0.4})`;
ctx.lineWidth = 1.5;
ctx.beginPath(); ctx.arc(px, pz, 6 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
ctx.restore();
```

`Date.now()` in the draw path means world view needs to redraw even when player doesn't move (for the pulse animation). Add a `_worldAnimFrame` invalidation path in `update()`:

```ts
// In the mode === 'world' branch, remove the `moved || rotated` throttle
// so the canvas redraws every frame in world mode (blit cost is negligible).
```

#### [ ] 5. Invalidate world pre-render on manifest change

**File**: `client/src/ui/Minimap.ts`

Add public method (called from `WorldGenerator` or directly):

```ts
invalidateWorldBiomeCache(): void {
  this._worldBiomeDirty = true;
}
```

Call in `onShow()` too as a defensive reset.

### Success Criteria

#### Automated Verification:
- [ ] `rtk tsc` passes
- [ ] `rtk vitest` passes

#### Manual Verification:
- [ ] Local mode biome colors show smooth gradients at biome edges (no hard color steps)
- [ ] World mode player beacon pulses visibly
- [ ] World mode vignette darkens edges without obscuring zone labels
- [ ] Switching modes multiple times is stable — no canvas size flicker

---

## Testing Strategy

### Unit Tests
- [ ] `Minimap` field initialization test passes (existing — `client/src/__tests__/UIComponentFields.test.ts:149`)
- [ ] Mode toggle: `map._setMode('world')` → `canvas.width === 500`; `_setMode('local')` → `canvas.width === 290`

### Manual Testing Steps
1. Press M in-game → World tab active, 500×500 map appears centered
2. Walk around — player beacon moves correctly, zone label under beacon matches zone display
3. Click [Local] → 290×290 player-centered map, existing behavior intact
4. Click [World] again → world map, no visual artifacts
5. Inspect zone edges — biome colors blend smoothly at biome boundaries
6. Verify NPC dots appear in world view when NPCs are in range

## Performance Considerations

- World biome pre-render: ~15,625 `getBiomeWeights` calls at step=4. Each is ~10 trig ops. Total ≈ 156k trig ops → < 5ms on modern hardware. Runs once, cached.
- World view per-frame: `drawImage()` blit + zone overlays (11 rects + labels) + dots. < 1ms per frame.
- Local mode biome loop: step=6 gives ~2330 `getBiomeWeights` calls vs 2330 `getDominantBiome` calls — same cost.
- Pulse animation: removes throttle in world mode — runs every frame. `drawImage` blit is GPU-accelerated, safe.

## References

- Existing minimap: `client/src/ui/Minimap.ts`
- Zone bounds: `client/src/systems/ZoneTracker.ts:34`
- Zone accent colors: `client/src/ui/ZoneDisplay.ts:11`
- Biome weights API: `client/src/scene/Biomes.ts:195`
- M-key binding: `client/src/core/GameBootstrapper.ts:301`
- NPC dots push: `client/src/core/GameEngine.ts:358`
