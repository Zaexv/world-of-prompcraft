import { UIComponent } from "./core/UIComponent";
import { BiomeType, getDominantBiome, getBiomeWeights } from '../scene/Biomes';
import { ZONES, LOCALE_DISCS } from '../systems/ZoneTracker';

const MM_SIZE  = 290;
const MM_SCALE = 2.0; // wu/px at 1.0 zoom
const LM_MARGIN = 110; // local biome cache scroll headroom (px each side)

const WM_MAP_SIZE = 500;
const WM_RANGE    = 600;

const WM_MIN_ZOOM = 0.25;
const WM_MAX_ZOOM = 8.0;
const MM_MIN_ZOOM = 0.5;
const MM_MAX_ZOOM = 8.0;
const ZOOM_STEP   = Math.sqrt(2); // ~1.414x per click

export interface MinimapWaypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: 'landmark' | 'feature' | 'teleport';
  /** Footprint radius (world units) used to offset teleport arrival clear of the mesh. */
  safeRadius?: number;
}

export interface MinimapNPCDot {
  x: number;
  z: number;
  hostile: boolean;
  name: string;
}

export class Minimap extends UIComponent {
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;
  declare private biomeLabel: HTMLDivElement;
  declare private coordLabel: HTMLDivElement;
  declare private modeWorldBtn: HTMLButtonElement;
  declare private modeLocalBtn: HTMLButtonElement;
  declare private zoomLabel: HTMLSpanElement;

  private viewMode: 'local' | 'world' = 'world';
  private _worldBiomeCanvas: HTMLCanvasElement | null = null;
  private _worldBiomeDirty = true;

  // Local-mode biome cache: an oversized offscreen raster blitted as a scrolling
  // crop so moving/turning costs a blit, not thousands of getBiomeWeights samples.
  private _localBiomeCanvas: HTMLCanvasElement | null = null;
  private _localCacheX = NaN;
  private _localCacheZ = NaN;
  private _localCacheScale = NaN;

  // Zoom state
  private worldZoom = 1.0;
  private localZoom = 1.0;

  // Pan state (world mode only, in world units)
  private worldPanX = 0;
  private worldPanZ = 0;

  // Drag state for pan
  private _isDragging = false;
  private _dragStartCanvasX = 0;
  private _dragStartCanvasY = 0;
  private _dragStartPanX = 0;
  private _dragStartPanZ = 0;

  // World waypoints and entity dots
  private waypoints: MinimapWaypoint[] = [];
  private npcDots: MinimapNPCDot[] = [];
  private hoveredWaypointId: string | null = null;

  onWaypointClick: ((waypoint: MinimapWaypoint) => void) | null = null;

  // Last drawn player position (hit-testing reference for waypoint clicks).
  private lastDrawX = NaN;
  private lastDrawZ = NaN;

  constructor() {
    super('ui-root', 'minimap');
    this.canvas.style.cursor = 'default';
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave.bind(this));
    this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
  }

  setNPCDots(dots: MinimapNPCDot[]): void {
    this.npcDots = dots;
  }

  render(): void {
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: `${MM_SIZE + 8}px`,
      display: 'none',
      flexDirection: 'column',
      background: 'rgba(8, 6, 18, 0.92)',
      border: '1px solid rgba(197, 165, 90, 0.45)',
      borderRadius: '8px',
      pointerEvents: 'auto',
      zIndex: '100',
      boxShadow: '0 4px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(197,165,90,0.15)',
      overflow: 'hidden',
    } as Partial<CSSStyleDeclaration>);

    // ── Title bar ──────────────────────────────────────────────────────────
    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 10px',
      borderBottom: '1px solid rgba(197, 165, 90, 0.25)',
      background: 'rgba(0,0,0,0.25)',
    } as Partial<CSSStyleDeclaration>);

    const titleText = document.createElement('span');
    Object.assign(titleText.style, {
      color: '#c5a55a',
      fontSize: '10px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '2px',
      textTransform: 'uppercase',
      fontWeight: '700',
    } as Partial<CSSStyleDeclaration>);
    titleText.textContent = 'World Map';

    const modeBar = document.createElement('div');
    modeBar.style.cssText = 'display:flex;gap:4px;margin-left:8px;';

    this.modeWorldBtn = document.createElement('button');
    this.modeWorldBtn.textContent = 'World';
    Object.assign(this.modeWorldBtn.style, {
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      fontSize: '9px',
      fontFamily: "'Cinzel', serif",
      padding: '2px 4px',
    } as Partial<CSSStyleDeclaration>);
    this.modeLocalBtn = document.createElement('button');
    this.modeLocalBtn.textContent = 'Local';
    Object.assign(this.modeLocalBtn.style, {
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      fontSize: '9px',
      fontFamily: "'Cinzel', serif",
      padding: '2px 4px',
    } as Partial<CSSStyleDeclaration>);

    this.modeWorldBtn.addEventListener('click', () => this._setMode('world'));
    this.modeLocalBtn.addEventListener('click', () => this._setMode('local'));

    modeBar.appendChild(this.modeWorldBtn);
    modeBar.appendChild(this.modeLocalBtn);

    this.biomeLabel = document.createElement('div');
    Object.assign(this.biomeLabel.style, {
      color: '#888',
      fontSize: '9px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '1px',
      fontStyle: 'italic',
    } as Partial<CSSStyleDeclaration>);
    this.biomeLabel.textContent = '—';

    titleBar.appendChild(titleText);
    titleBar.appendChild(modeBar);
    titleBar.appendChild(this.biomeLabel);
    this.container.appendChild(titleBar);

    // ── Zoom controls ──────────────────────────────────────────────────────
    const zoomBar = document.createElement('div');
    Object.assign(zoomBar.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '3px 8px',
      borderBottom: '1px solid rgba(197,165,90,0.15)',
      background: 'rgba(0,0,0,0.15)',
    } as Partial<CSSStyleDeclaration>);

    const btnStyle = {
      background: 'rgba(197,165,90,0.12)',
      border: '1px solid rgba(197,165,90,0.3)',
      color: '#c5a55a',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      width: '20px',
      height: '20px',
      borderRadius: '3px',
      padding: '0',
      lineHeight: '18px',
      textAlign: 'center' as const,
      userSelect: 'none' as const,
    };

    const zoomOutBtn = document.createElement('button');
    Object.assign(zoomOutBtn.style, btnStyle);
    zoomOutBtn.textContent = '−';
    zoomOutBtn.title = 'Zoom out (scroll wheel also works)';
    zoomOutBtn.addEventListener('click', () => this._zoomBy(-1));

    this.zoomLabel = document.createElement('span');
    Object.assign(this.zoomLabel.style, {
      color: 'rgba(197,165,90,0.7)',
      fontSize: '9px',
      fontFamily: "'Cinzel', serif",
      minWidth: '36px',
      textAlign: 'center',
      letterSpacing: '0.5px',
    } as Partial<CSSStyleDeclaration>);
    this.zoomLabel.textContent = '1.0×';

    const zoomInBtn = document.createElement('button');
    Object.assign(zoomInBtn.style, btnStyle);
    zoomInBtn.textContent = '+';
    zoomInBtn.title = 'Zoom in (scroll wheel also works)';
    zoomInBtn.addEventListener('click', () => this._zoomBy(+1));

    const resetBtn = document.createElement('button');
    Object.assign(resetBtn.style, {
      ...btnStyle,
      width: 'auto',
      padding: '0 5px',
      fontSize: '7px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '0.5px',
    });
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Reset zoom and pan';
    resetBtn.addEventListener('click', () => this._resetView());

    // "Center on player" button (world mode only)
    const centerBtn = document.createElement('button');
    Object.assign(centerBtn.style, {
      ...btnStyle,
      width: 'auto',
      padding: '0 5px',
      fontSize: '7px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '0.5px',
    });
    centerBtn.textContent = 'Center';
    centerBtn.title = 'Center map on player';
    centerBtn.addEventListener('click', () => {
      this.worldPanX = this.lastDrawX;
      this.worldPanZ = this.lastDrawZ;
      this._worldBiomeDirty = true;
      this.lastDrawX = NaN;
    });

    zoomBar.appendChild(zoomOutBtn);
    zoomBar.appendChild(this.zoomLabel);
    zoomBar.appendChild(zoomInBtn);
    zoomBar.appendChild(resetBtn);
    zoomBar.appendChild(centerBtn);
    this.container.appendChild(zoomBar);

    // ── Canvas ─────────────────────────────────────────────────────────────
    this.canvas = document.createElement('canvas');
    this.canvas.width = MM_SIZE;
    this.canvas.height = MM_SIZE;
    Object.assign(this.canvas.style, {
      display: 'block',
      width: `${MM_SIZE}px`,
      height: `${MM_SIZE}px`,
      margin: '4px auto',
      borderRadius: '4px',
    } as Partial<CSSStyleDeclaration>);
    this.container.appendChild(this.canvas);

    // ── Footer: coordinates + compact biome legend ─────────────────────────
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      borderTop: '1px solid rgba(197,165,90,0.15)',
      padding: '4px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    } as Partial<CSSStyleDeclaration>);

    this.coordLabel = document.createElement('div');
    Object.assign(this.coordLabel.style, {
      color: 'rgba(197,165,90,0.6)',
      fontSize: '9px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '0.5px',
      textAlign: 'center',
    } as Partial<CSSStyleDeclaration>);
    this.coordLabel.textContent = 'x: 0  z: 0';
    footer.appendChild(this.coordLabel);

    const legendEntries: Array<[string, string]> = [
      ['#2d6b38', 'Forest'], ['#9c3a12', 'Lava'], ['#4a7fa8', 'Tundra'],
      ['#1e5c3a', 'Swamps'], ['#7a9422', 'Malaka'], ['#9a7230', 'Desert'],
    ];
    const legendRow = document.createElement('div');
    Object.assign(legendRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '3px 8px',
      justifyContent: 'center',
    } as Partial<CSSStyleDeclaration>);
    for (const [color, label] of legendEntries) {
      const entry = document.createElement('div');
      Object.assign(entry.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '8px',
        color: 'rgba(197,165,90,0.5)',
        fontFamily: "'Cinzel', serif",
      } as Partial<CSSStyleDeclaration>);
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        width: '6px', height: '6px', borderRadius: '1px',
        background: color, flexShrink: '0',
      } as Partial<CSSStyleDeclaration>);
      entry.appendChild(dot);
      entry.appendChild(document.createTextNode(label));
      legendRow.appendChild(entry);
    }
    footer.appendChild(legendRow);

    // Hint text
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      color: 'rgba(197,165,90,0.3)',
      fontSize: '8px',
      fontFamily: "'Cinzel', serif",
      textAlign: 'center',
    } as Partial<CSSStyleDeclaration>);
    hint.textContent = 'Scroll to zoom · Drag to pan';
    footer.appendChild(hint);

    this.container.appendChild(footer);

    this.ctx = this.canvas.getContext('2d')!;
    this._updateModeButtons();
    this._updateZoomLabel();
  }

  protected override onShow(): void {
    this.container.style.display = 'flex';
    this.lastDrawX = NaN;
    this.lastDrawZ = NaN;
    this._worldBiomeDirty = true;
  }

  setWaypoints(waypoints: MinimapWaypoint[]): void {
    this.waypoints = waypoints.map((waypoint) => ({ ...waypoint }));
    this._worldBiomeDirty = true; // waypoints are baked into the static layer
  }

  addWaypoint(waypoint: MinimapWaypoint): void {
    this.waypoints.push({ ...waypoint });
    this._worldBiomeDirty = true;
  }

  addTown(x: number, z: number, label = 'Town'): void {
    this.addWaypoint({ id: `town:${label}:${x}:${z}`, label, x, z, kind: 'landmark' });
  }

  addCave(x: number, z: number, label = 'Cave'): void {
    this.addWaypoint({ id: `cave:${label}:${x}:${z}`, label, x, z, kind: 'feature' });
  }

  invalidateWorldBiomeCache(): void {
    this._worldBiomeDirty = true;
  }

  // ── Zoom / pan ──────────────────────────────────────────────────────────

  private _zoomBy(direction: 1 | -1): void {
    const min = this.viewMode === 'world' ? WM_MIN_ZOOM : MM_MIN_ZOOM;
    const max = this.viewMode === 'world' ? WM_MAX_ZOOM : MM_MAX_ZOOM;
    if (this.viewMode === 'world') {
      this.worldZoom = Math.max(min, Math.min(max,
        direction > 0 ? this.worldZoom * ZOOM_STEP : this.worldZoom / ZOOM_STEP
      ));
      this._worldBiomeDirty = true;
    } else {
      this.localZoom = Math.max(min, Math.min(max,
        direction > 0 ? this.localZoom * ZOOM_STEP : this.localZoom / ZOOM_STEP
      ));
    }
    this._updateZoomLabel();
    this.lastDrawX = NaN; // force redraw
  }

  private _resetView(): void {
    if (this.viewMode === 'world') {
      this.worldZoom = 1.0;
      this.worldPanX = 0;
      this.worldPanZ = 0;
      this._worldBiomeDirty = true;
    } else {
      this.localZoom = 1.0;
    }
    this._updateZoomLabel();
    this.lastDrawX = NaN;
  }

  private _updateZoomLabel(): void {
    if (!this.zoomLabel) return;
    const mode = this.viewMode ?? 'world';
    const zoom = (mode === 'world' ? this.worldZoom : this.localZoom) ?? 1.0;
    this.zoomLabel.textContent = `${zoom.toFixed(zoom < 1 ? 2 : 1)}×`;
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    this._zoomBy(event.deltaY < 0 ? 1 : -1);
  }

  private _setMode(mode: 'local' | 'world'): void {
    this.viewMode = mode;
    const size = mode === 'world' ? WM_MAP_SIZE : MM_SIZE;
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.style.width  = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.container.style.width = `${size + 8}px`;
    this.lastDrawX = NaN;
    this._worldBiomeDirty = true;
    this._updateModeButtons();
    this._updateZoomLabel();
  }

  private _updateModeButtons(): void {
    const activeStyle   = 'rgba(197,165,90,0.9)';
    const inactiveStyle = 'rgba(197,165,90,0.3)';
    this.modeWorldBtn.style.color = this.viewMode === 'world' ? activeStyle : inactiveStyle;
    this.modeLocalBtn.style.color = this.viewMode === 'local' ? activeStyle : inactiveStyle;
  }

  private _worldEffectiveScale(): number {
    const range = WM_RANGE / this.worldZoom;
    return (range * 2) / WM_MAP_SIZE;
  }

  /**
   * Pre-render the entire STATIC world-map layer to an offscreen canvas: biome
   * raster, region labels, locale rings, waypoints, vignette and compass. None
   * of these depend on the player position, so we bake them once (on pan / zoom /
   * waypoint / hover change) and just blit them every frame. Only the player
   * beacon and NPC dots are drawn live — this is what keeps the map from lagging
   * the game while moving.
   */
  private _prerenderWorldBiomes(): void {
    const S     = WM_MAP_SIZE;
    const scale = this._worldEffectiveScale();
    const cx    = this.worldPanX;
    const cz    = this.worldPanZ;
    // Adaptive step: coarser at zoom-out (faster), finer at zoom-in (more detail)
    const step  = Math.max(2, Math.ceil(4 / this.worldZoom));

    if (!this._worldBiomeCanvas) {
      this._worldBiomeCanvas = document.createElement('canvas');
      this._worldBiomeCanvas.width  = S;
      this._worldBiomeCanvas.height = S;
    }
    const offCtx = this._worldBiomeCanvas.getContext('2d')!;
    // Warm parchment base shows at the map fringe beyond the known world.
    offCtx.fillStyle = '#1a1206';
    offCtx.fillRect(0, 0, S, S);

    for (let px = 0; px < S; px += step) {
      for (let py = 0; py < S; py += step) {
        const wx = cx + (px - S / 2) * scale;
        const wz = cz + (py - S / 2) * scale;
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

    // ── Static overlays baked into the same canvas ───────────────────────────
    this._drawRegionLabels(offCtx, scale, cx, cz);

    const sortedWps = [...this.waypoints].sort(
      (a, b) => (a.kind === 'teleport' ? 1 : 0) - (b.kind === 'teleport' ? 1 : 0),
    );
    for (const wp of sortedWps) {
      const wx = (wp.x - cx) / scale + S / 2;
      const wy = (wp.z - cz) / scale + S / 2;
      if (wx < -12 || wx > S + 12 || wy < -12 || wy > S + 12) continue;
      const highlighted = wp.id === this.hoveredWaypointId;
      this.drawWaypointMarker(offCtx, wx, wy, wp.kind, highlighted);
      if (wp.kind === 'teleport') {
        this.drawWaypointLabel(offCtx, wx, wy, wp.label, highlighted);
      }
    }

    // Edge vignette
    const vg = offCtx.createRadialGradient(S/2, S/2, S*0.32, S/2, S/2, S*0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    offCtx.fillStyle = vg;
    offCtx.fillRect(0, 0, S, S);

    // Pan indicator (shown when not centered on 0,0)
    if (Math.abs(cx) > 10 || Math.abs(cz) > 10) {
      offCtx.save();
      offCtx.font = '8px "Cinzel", serif';
      offCtx.fillStyle = 'rgba(197,165,90,0.5)';
      offCtx.textAlign = 'left';
      offCtx.fillText(`pan: ${Math.round(cx)}, ${Math.round(cz)}`, 6, S - 6);
      offCtx.restore();
    }

    this._drawCompass(offCtx, S);

    this._worldBiomeDirty = false;
  }

  /**
   * Bake the local (player-centred) biome raster into an oversized offscreen
   * canvas centred on (cx,cz). Local mode then blits a scrolling crop of this,
   * re-baking only when the player nears the margin or the zoom changes.
   */
  private _rebakeLocalBiomes(cx: number, cz: number, scale: number): void {
    const full = MM_SIZE + 2 * LM_MARGIN;
    if (!this._localBiomeCanvas) {
      this._localBiomeCanvas = document.createElement('canvas');
      this._localBiomeCanvas.width = full;
      this._localBiomeCanvas.height = full;
    }
    const octx = this._localBiomeCanvas.getContext('2d')!;
    octx.fillStyle = '#12141e';
    octx.fillRect(0, 0, full, full);
    const step = Math.max(2, Math.ceil(6 / this.localZoom));
    for (let px = 0; px < full; px += step) {
      for (let py = 0; py < full; py += step) {
        const wx = cx + (px - full / 2) * scale;
        const wz = cz + (py - full / 2) * scale;
        const weights = getBiomeWeights(wx, wz);
        let r = 0, g = 0, b = 0;
        for (const [biome, color] of BIOME_COLOR_COMPONENTS) {
          const w = weights[biome];
          if (w > 0.001) { r += color.r * w; g += color.g * w; b += color.b * w; }
        }
        octx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        octx.fillRect(px, py, step, step);
      }
    }
    this._localCacheX = cx;
    this._localCacheZ = cz;
    this._localCacheScale = scale;
  }

  /**
   * Draw one engraved label per region at its anchor point. Zones are a clean
   * non-overlapping partition (see ZoneTracker), so labels no longer stack —
   * we just place each name at its representative centroid.
   */
  private _drawRegionLabels(ctx: CanvasRenderingContext2D, scale: number, panX: number, panZ: number): void {
    const S = WM_MAP_SIZE;

    // Cartographic territory rings for the named inner locales (Makaleta
    // Strande, Fort Malaka). Thin dashed circles tie each label to its ground.
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const disc of LOCALE_DISCS) {
      const cxp = (disc.x - panX) / scale + S / 2;
      const czp = (disc.z - panZ) / scale + S / 2;
      const rp = disc.radius / scale;
      if (cxp + rp < 0 || cxp - rp > S || czp + rp < 0 || czp - rp > S) continue;
      ctx.strokeStyle = `${ZONE_ACCENT_COLORS[disc.name] ?? ZONE_DEFAULT_ACCENT}66`;
      ctx.beginPath();
      ctx.arc(cxp, czp, rp, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const margin = 16;
    // letterSpacing is supported in the Canvas2D context of the app's target
    // browsers; harmless no-op where it isn't.
    type SpacedCtx = CanvasRenderingContext2D & { letterSpacing?: string };
    for (const zone of ZONES) {
      const lx = (zone.labelX - panX) / scale + S / 2;
      const lz = (zone.labelZ - panZ) / scale + S / 2;
      if (lx < margin || lx > S - margin || lz < margin || lz > S - margin) continue;
      const accent = ZONE_ACCENT_COLORS[zone.name] ?? ZONE_DEFAULT_ACCENT;
      const name = zone.name.toUpperCase();

      ctx.save();
      ctx.font = 'bold 11px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      (ctx as SpacedCtx).letterSpacing = '1.5px';
      // Dark engraved shadow underneath for legibility over any biome color.
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = 4;
      ctx.fillText(name, lx + 0.8, lz + 0.8);
      ctx.shadowBlur = 2;
      ctx.fillStyle = accent;
      ctx.fillText(name, lx, lz);
      (ctx as SpacedCtx).letterSpacing = '0px';
      ctx.restore();
    }
  }

  private _drawWorldView(playerX: number, playerZ: number): void {
    if (this._worldBiomeDirty) this._prerenderWorldBiomes();
    const ctx  = this.ctx;
    const S    = WM_MAP_SIZE;
    const scale = this._worldEffectiveScale();
    const panX  = this.worldPanX;
    const panZ  = this.worldPanZ;

    // Blit the baked static layer (biomes, labels, waypoints, vignette, compass).
    ctx.drawImage(this._worldBiomeCanvas!, 0, 0);

    // ── Dynamic layer only (cheap, redrawn every frame) ──────────────────────
    // NPC dots
    for (const npc of this.npcDots) {
      const nx = (npc.x - panX) / scale + S / 2;
      const nz = (npc.z - panZ) / scale + S / 2;
      if (nx < -4 || nx > S + 4 || nz < -4 || nz > S + 4) continue;
      ctx.save();
      ctx.shadowColor = npc.hostile ? '#ff4444' : '#44ff88';
      ctx.shadowBlur = 4;
      ctx.fillStyle  = npc.hostile ? '#ff6644' : '#88ffaa';
      ctx.beginPath(); ctx.arc(nx, nz, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Player dot (pulsing)
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
    const px = (playerX - panX) / scale + S / 2;
    const pz = (playerZ - panZ) / scale + S / 2;
    const inView = px >= -10 && px <= S + 10 && pz >= -10 && pz <= S + 10;

    if (inView) {
      ctx.save();
      ctx.shadowColor = '#ffd966'; ctx.shadowBlur = 8 + pulse * 6;
      ctx.fillStyle = '#ffd966';
      ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,217,102,${0.3 + pulse * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, pz, 6 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else {
      // Off-screen indicator: arrow pointing toward player
      this._drawOffscreenArrow(ctx, px, pz, S);
    }
  }

  private _drawOffscreenArrow(ctx: CanvasRenderingContext2D, px: number, pz: number, S: number): void {
    const cx = S / 2, cy = S / 2;
    const angle = Math.atan2(pz - cy, px - cx);
    const margin = 14;
    const ax = cx + Math.cos(angle) * (S / 2 - margin);
    const ay = cy + Math.sin(angle) * (S / 2 - margin);

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(255,217,102,0.8)';
    ctx.shadowColor = '#ffd966';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-4, 3);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private _drawCompass(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(197,165,90,0.7)';
    ctx.fillText('N', size / 2, 11);
    ctx.fillText('S', size / 2, size - 2);
    ctx.textAlign = 'left';
    ctx.fillText('W', 3, size / 2 + 3);
    ctx.textAlign = 'right';
    ctx.fillText('E', size - 3, size / 2 + 3);
  }

  update(playerX: number, playerZ: number, playerAngle: number): void {
    if (!this.isVisible) return;

    if (this.viewMode === 'world') {
      const ctx = this.ctx;
      if (!ctx) return;
      this.lastDrawX = playerX;
      this.lastDrawZ = playerZ;
      ctx.clearRect(0, 0, WM_MAP_SIZE, WM_MAP_SIZE);
      this._drawWorldView(playerX, playerZ);
      // Only touch the DOM when the displayed text actually changes (avoids a
      // per-frame reflow while the player moves).
      const coordText = `x: ${Math.round(playerX)}  z: ${Math.round(playerZ)}`;
      if (this.coordLabel.textContent !== coordText) this.coordLabel.textContent = coordText;
      const biomeText = BIOME_NAMES[getDominantBiome(playerX, playerZ)] ?? '—';
      if (this.biomeLabel.textContent !== biomeText) this.biomeLabel.textContent = biomeText;
      return;
    }

    // Local mode — player-centred. The biome raster is cached in an oversized
    // offscreen canvas and blitted as a scrolling crop, so moving/turning costs a
    // blit (not thousands of getBiomeWeights samples). Re-baked only when the
    // player nears the cache margin or the zoom changes.
    this.lastDrawX = playerX;
    this.lastDrawZ = playerZ;

    const ctx = this.ctx;
    if (!ctx) return;
    const S     = MM_SIZE;
    const scale = MM_SCALE / this.localZoom; // effective wu/px
    const halfWorld = (S * scale) / 2;
    const dominantBiome = getDominantBiome(playerX, playerZ);

    const offX = (playerX - this._localCacheX) / scale;
    const offZ = (playerZ - this._localCacheZ) / scale;
    if (
      !this._localBiomeCanvas || this._localCacheScale !== scale ||
      !Number.isFinite(offX) || Math.abs(offX) > LM_MARGIN * 0.8 || Math.abs(offZ) > LM_MARGIN * 0.8
    ) {
      this._rebakeLocalBiomes(playerX, playerZ, scale);
    }
    const sx = LM_MARGIN + (playerX - this._localCacheX) / scale;
    const sy = LM_MARGIN + (playerZ - this._localCacheZ) / scale;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this._localBiomeCanvas!, sx, sy, S, S, 0, 0, S, S);

    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S, S);

    // Chunk grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    const chunkSize = 64;
    const firstChunkX = Math.ceil((playerX - halfWorld) / chunkSize) * chunkSize;
    const firstChunkZ = Math.ceil((playerZ - halfWorld) / chunkSize) * chunkSize;
    for (let wx = firstChunkX; wx < playerX + halfWorld; wx += chunkSize) {
      const cpx = (wx - playerX) / scale + S / 2;
      ctx.beginPath(); ctx.moveTo(cpx, 0); ctx.lineTo(cpx, S); ctx.stroke();
    }
    for (let wz = firstChunkZ; wz < playerZ + halfWorld; wz += chunkSize) {
      const cpy = (wz - playerZ) / scale + S / 2;
      ctx.beginPath(); ctx.moveTo(0, cpy); ctx.lineTo(S, cpy); ctx.stroke();
    }

    // NPC dots
    for (const npc of this.npcDots) {
      const nx = (npc.x - playerX) / scale + S / 2;
      const nz = (npc.z - playerZ) / scale + S / 2;
      if (nx < -4 || nx > S + 4 || nz < -4 || nz > S + 4) continue;
      ctx.save();
      ctx.shadowColor = npc.hostile ? '#ff4444' : '#44ff88';
      ctx.shadowBlur = 4;
      ctx.fillStyle = npc.hostile ? '#ff6644' : '#88ffaa';
      ctx.beginPath();
      ctx.arc(nx, nz, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Waypoints
    for (const waypoint of this.waypoints) {
      const marker = this.getMarkerPoint(waypoint, playerX, playerZ, scale, S);
      if (!marker) continue;
      const highlighted = waypoint.id === this.hoveredWaypointId;
      this.drawWaypointMarker(ctx, marker.x, marker.y, waypoint.kind, highlighted);
      this.drawWaypointLabel(ctx, marker.x, marker.y, waypoint.label, highlighted);
    }

    // Player indicator
    const cx = S / 2;
    const cy = S / 2;
    ctx.save();
    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(68,255,136,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(playerAngle);
    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#44ff88';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-5, 4);
    ctx.lineTo(0, 1);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    this._drawCompass(ctx, S);

    this.biomeLabel.textContent = BIOME_NAMES[dominantBiome] ?? '—';
    this.coordLabel.textContent = `x: ${Math.round(playerX)}  z: ${Math.round(playerZ)}`;
  }

  get element(): HTMLElement {
    return this.container;
  }

  // ── Pointer / drag / hover ─────────────────────────────────────────────

  private handlePointerDown(event: PointerEvent): void {
    // Check waypoint first (only in local mode or world mode without drag intent)
    const waypoint = this.getWaypointAtEvent(event);
    if (waypoint && !this._isDragging) {
      this.onWaypointClick?.(waypoint);
      return;
    }

    // Start drag for pan (world mode)
    if (this.viewMode === 'world') {
      this._isDragging = true;
      this._dragStartCanvasX = event.clientX;
      this._dragStartCanvasY = event.clientY;
      this._dragStartPanX = this.worldPanX;
      this._dragStartPanZ = this.worldPanZ;
      this.canvas.style.cursor = 'grabbing';
      this.canvas.setPointerCapture(event.pointerId);
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this._isDragging && this.viewMode === 'world') {
      const scale = this._worldEffectiveScale();
      const dx = event.clientX - this._dragStartCanvasX;
      const dy = event.clientY - this._dragStartCanvasY;
      this.worldPanX = this._dragStartPanX - dx * scale;
      this.worldPanZ = this._dragStartPanZ - dy * scale;
      this._worldBiomeDirty = true;
      this.lastDrawX = NaN;
      return;
    }

    const waypoint = this.getWaypointAtEvent(event);
    const newHover = waypoint?.id ?? null;
    if (newHover !== this.hoveredWaypointId) {
      this.hoveredWaypointId = newHover;
      // Hover highlight is baked into the static world layer — rebake on change.
      if (this.viewMode === 'world') this._worldBiomeDirty = true;
    }
    this.canvas.style.cursor = waypoint ? 'pointer' : (this.viewMode === 'world' ? 'grab' : 'default');
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this._isDragging) {
      this._isDragging = false;
      this.canvas.style.cursor = this.viewMode === 'world' ? 'grab' : 'default';
      this.canvas.releasePointerCapture(event.pointerId);
    }
  }

  private handlePointerLeave(): void {
    if (!this._isDragging) {
      this.hoveredWaypointId = null;
      this.canvas.style.cursor = 'default';
    }
  }

  private getWaypointAtEvent(event: PointerEvent): MinimapWaypoint | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return this.getWaypointAtCanvasPoint(x, y);
  }

  private getWaypointAtCanvasPoint(x: number, y: number): MinimapWaypoint | null {
    // Project each waypoint with the SAME scale/center the active view draws it,
    // so hit-testing lines up in both world and local modes.
    let center: { x: number; z: number };
    let scale: number;
    let size: number;
    if (this.viewMode === 'world') {
      center = { x: this.worldPanX, z: this.worldPanZ };
      scale = this._worldEffectiveScale();
      size = WM_MAP_SIZE;
    } else {
      if (!Number.isFinite(this.lastDrawX) || !Number.isFinite(this.lastDrawZ)) return null;
      center = { x: this.lastDrawX, z: this.lastDrawZ };
      scale = MM_SCALE / this.localZoom;
      size = MM_SIZE;
    }

    const markerRadius = 12;
    let closest: { waypoint: MinimapWaypoint; distanceSq: number } | null = null;
    for (const waypoint of this.waypoints) {
      const marker = this.getMarkerPoint(waypoint, center.x, center.z, scale, size);
      if (!marker) continue;
      const dx = x - marker.x;
      const dy = y - marker.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= markerRadius * markerRadius && (!closest || distanceSq < closest.distanceSq)) {
        closest = { waypoint, distanceSq };
      }
    }
    return closest?.waypoint ?? null;
  }

  private getMarkerPoint(
    waypoint: MinimapWaypoint,
    playerX: number,
    playerZ: number,
    scale: number,
    size: number,
  ): { x: number; y: number } | null {
    const x = (waypoint.x - playerX) / scale + size / 2;
    const y = (waypoint.z - playerZ) / scale + size / 2;
    if (x < -12 || x > size + 12 || y < -12 || y > size + 12) return null;
    return { x, y };
  }

  private drawWaypointMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    kind: MinimapWaypoint['kind'],
    highlighted: boolean,
  ): void {
    if (kind === 'teleport') {
      this.drawTeleportMarker(ctx, x, y, highlighted);
      return;
    }

    const accent = kind === 'feature' ? '#82d8ff' : '#ffcc44';
    const outline = kind === 'feature' ? '#2c7fb8' : '#aa8800';
    const radius = highlighted ? 5 : 4;

    ctx.save();
    ctx.shadowColor = highlighted ? accent : 'transparent';
    ctx.shadowBlur = highlighted ? 8 : 0;
    ctx.fillStyle = accent;
    ctx.strokeStyle = outline;
    ctx.lineWidth = highlighted ? 1.3 : 0.8;
    ctx.beginPath();
    if (kind === 'feature') {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - radius - 2, y);
      ctx.lineTo(x + radius + 2, y);
      ctx.moveTo(x, y - radius - 2);
      ctx.lineTo(x, y + radius + 2);
      ctx.strokeStyle = highlighted ? '#d8fbff' : '#ffffff';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    } else {
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Portal-rune marker for fast-travel points — a glowing ringed star. */
  private drawTeleportMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    highlighted: boolean,
  ): void {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
    const r = highlighted ? 6 : 5;
    ctx.save();
    ctx.translate(x, y);
    // Outer glow ring
    ctx.shadowColor = '#b388ff';
    ctx.shadowBlur = highlighted ? 12 : 6 + pulse * 4;
    ctx.strokeStyle = `rgba(179,136,255,${0.5 + pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    // Inner diamond/star
    ctx.shadowBlur = 0;
    ctx.fillStyle = highlighted ? '#e6d4ff' : '#c8a8ff';
    ctx.strokeStyle = '#7a4fd0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.45, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.45, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(0, -r * 0.45);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawWaypointLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    highlighted: boolean,
  ): void {
    const padX = 4;
    const padY = 2;
    ctx.save();
    ctx.font = '8px monospace';
    const width = ctx.measureText(label).width;
    const boxX = x + 7;
    const boxY = y - 10;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.72)';
    ctx.strokeStyle = highlighted ? 'rgba(255, 255, 255, 0.5)' : 'rgba(170, 136, 0, 0.35)';
    ctx.lineWidth = 0.8;
    this.fillRoundedRect(ctx, boxX, boxY - 8, width + padX * 2, 12 + padY, 3);
    ctx.fillStyle = highlighted ? '#ffffff' : '#e8d9a8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, boxX + padX, boxY - 6);
    ctx.restore();
  }

  private fillRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

const BIOME_COLORS: Record<BiomeType, string> = {
  [BiomeType.Teldrassil]: '#2d6b38',
  [BiomeType.BlastedSuarezLands]: '#9c3a12',
  [BiomeType.CrystalTundra]: '#4a7fa8',
  [BiomeType.MoinSwamps]: '#1e5c3a',
  [BiomeType.MalakaArea]: '#7a9422',
  [BiomeType.TanisDesert]: '#9a7230',
};

const BIOME_NAMES: Record<BiomeType, string> = {
  [BiomeType.Teldrassil]: 'Teldrassil',
  [BiomeType.BlastedSuarezLands]: 'Blasted Suarezlands',
  [BiomeType.CrystalTundra]: 'Crystal Tundra',
  [BiomeType.MoinSwamps]: 'Moin Swamps',
  [BiomeType.MalakaArea]: 'Malaka Area',
  [BiomeType.TanisDesert]: 'Tanis Desert',
};

const BIOME_COLOR_COMPONENTS: Array<[BiomeType, {r:number,g:number,b:number}]> =
  Object.entries(BIOME_COLORS).map(([biome, hex]) => {
    const n = parseInt(hex.slice(1), 16);
    return [Number(biome) as BiomeType, { r: (n>>16)&0xff, g: (n>>8)&0xff, b: n&0xff }];
  });

const ZONE_ACCENT_COLORS: Record<string, string> = {
  "Makaleta Strande":     "#88ffcc",
  "Fort Malaka":         "#ffdd88",
  "Teldrassil Wilds":    "#9be07a",
  "Crystal Tundra":      "#aaeeff",
  "Blasted Suarezlands": "#ff8a4a",
  "Moin Swamps":         "#7fd06a",
  "Malaka Area":         "#eecc66",
  "Tanis Desert":        "#e0b86c",
};

const ZONE_DEFAULT_ACCENT = "#aaaaff";
