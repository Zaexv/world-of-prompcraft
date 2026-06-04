import { UIComponent } from "./core/UIComponent";
import { BiomeType, getDominantBiome, getBiomeWeights } from '../scene/Biomes';
import { ZONES } from '../systems/ZoneTracker';

// Module-level constants so they are defined when render() is called
// (instance class fields are undefined during super() → render()).
const MM_SIZE  = 290; // canvas pixels
const MM_SCALE = 2.0; // world-units per canvas pixel

const WM_MAP_SIZE = 500;
const WM_RANGE    = 600;
const WM_SCALE    = (WM_RANGE * 2) / WM_MAP_SIZE; // 2.4 wu/px

export interface MinimapWaypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: 'landmark' | 'feature';
}

export interface MinimapNPCDot {
  x: number;
  z: number;
  hostile: boolean;
  name: string;
}

/**
 * Canvas-based minimap overlay toggled with M key.
 * Extends UIComponent for consistent lifecycle management.
 */
export class Minimap extends UIComponent {
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;
  declare private biomeLabel: HTMLDivElement;
  declare private coordLabel: HTMLDivElement;
  declare private modeWorldBtn: HTMLButtonElement;
  declare private modeLocalBtn: HTMLButtonElement;

  private viewMode: 'local' | 'world' = 'world';
  private _worldBiomeCanvas: HTMLCanvasElement | null = null;
  private _worldBiomeDirty = true;

  // World waypoints and entity dots
  private waypoints: MinimapWaypoint[] = [];
  private npcDots: MinimapNPCDot[] = [];
  private hoveredWaypointId: string | null = null;

  onWaypointClick: ((waypoint: MinimapWaypoint) => void) | null = null;

  // Throttling
  private lastDrawX = NaN;
  private lastDrawZ = NaN;
  private lastDrawAngle = NaN;
  private frameSkip = 0;

  constructor() {
    super('ui-root', 'minimap');
    this.canvas.style.cursor = 'default';
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave.bind(this));
  }

  /** Update NPC positions so they appear as dots on the map. */
  setNPCDots(dots: MinimapNPCDot[]): void {
    this.npcDots = dots;
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
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

    titleBar.appendChild(titleText);
    titleBar.appendChild(modeBar);

    this.biomeLabel = document.createElement('div');
    Object.assign(this.biomeLabel.style, {
      color: '#888',
      fontSize: '9px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '1px',
      fontStyle: 'italic',
    } as Partial<CSSStyleDeclaration>);
    this.biomeLabel.textContent = '—';
    titleBar.appendChild(this.biomeLabel);

    this.container.appendChild(titleBar);

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

    // Compact legend: 3 dots per row, 2 rows
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
    this.container.appendChild(footer);

    this.ctx = this.canvas.getContext('2d')!;

    this._updateModeButtons();
  }

  protected override onShow(): void {
    // The container uses flex layout — UIComponent.show() sets display:'block'
    // which breaks the column layout, so we correct it here.
    this.container.style.display = 'flex';
    // Reset throttle so the canvas redraws immediately on next update() call.
    this.lastDrawX = NaN;
    this.lastDrawZ = NaN;
    this.lastDrawAngle = NaN;
    // Defensive reset of world biome cache
    this._worldBiomeDirty = true;
  }

  setWaypoints(waypoints: MinimapWaypoint[]): void {
    this.waypoints = waypoints.map((waypoint) => ({ ...waypoint }));
  }

  addWaypoint(waypoint: MinimapWaypoint): void {
    this.waypoints.push({ ...waypoint });
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

  private _setMode(mode: 'local' | 'world'): void {
    this.viewMode = mode;
    const size = mode === 'world' ? WM_MAP_SIZE : MM_SIZE;
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.style.width  = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.container.style.width = `${size + 8}px`;
    this.lastDrawX = NaN;
    this._updateModeButtons();
  }

  private _updateModeButtons(): void {
    const activeStyle   = 'rgba(197,165,90,0.9)';
    const inactiveStyle = 'rgba(197,165,90,0.3)';
    this.modeWorldBtn.style.color = this.viewMode === 'world' ? activeStyle : inactiveStyle;
    this.modeLocalBtn.style.color = this.viewMode === 'local' ? activeStyle : inactiveStyle;
  }

  private _prerenderWorldBiomes(): void {
    const S = WM_MAP_SIZE;
    const scale = WM_SCALE;
    const step = 4;

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
        const wx = (px - S / 2) * scale;
        const wz = (py - S / 2) * scale;
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

  private _drawZoneOverlays(ctx: CanvasRenderingContext2D): void {
    const S  = WM_MAP_SIZE;
    const sc = WM_SCALE;
    const toCanvasX = (wx: number) => wx / sc + S / 2;
    const toCanvasZ = (wz: number) => wz / sc + S / 2;
    const CLAMP = WM_RANGE;

    const sorted = [...ZONES].sort((a, b) =>
      (b.maxX - b.minX) * (b.maxZ - b.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ)
    );

    for (const zone of sorted) {
      const accent = ZONE_ACCENT_COLORS[zone.name] ?? ZONE_DEFAULT_ACCENT;
      const x0 = Math.max(zone.minX, -CLAMP);
      const x1 = Math.min(zone.maxX,  CLAMP);
      const z0 = Math.max(zone.minZ, -CLAMP);
      const z1 = Math.min(zone.maxZ,  CLAMP);
      if (x1 <= x0 || z1 <= z0) continue;

      const cx0 = toCanvasX(x0), cx1 = toCanvasX(x1);
      const cz0 = toCanvasZ(z0), cz1 = toCanvasZ(z1);
      const cw = cx1 - cx0, ch = cz1 - cz0;

      ctx.save();
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = accent;
      ctx.fillRect(cx0, cz0, cw, ch);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(cx0 + 0.5, cz0 + 0.5, cw - 1, ch - 1);
      ctx.restore();

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

  private _drawWorldView(playerX: number, playerZ: number): void {
    if (this._worldBiomeDirty) this._prerenderWorldBiomes();
    const ctx = this.ctx;
    const S = WM_MAP_SIZE;

    ctx.drawImage(this._worldBiomeCanvas!, 0, 0);
    this._drawZoneOverlays(ctx);

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

    for (const wp of this.waypoints) {
      const wx = wp.x / WM_SCALE + S / 2;
      const wy = wp.z / WM_SCALE + S / 2;
      if (wx < -12 || wx > S + 12 || wy < -12 || wy > S + 12) continue;
      this.drawWaypointMarker(ctx, wx, wy, wp.kind, false);
    }

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
    const px = playerX / WM_SCALE + S / 2;
    const pz = playerZ / WM_SCALE + S / 2;
    ctx.save();
    ctx.shadowColor = '#ffd966'; ctx.shadowBlur = 8 + pulse * 6;
    ctx.fillStyle = '#ffd966';
    ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,217,102,${0.3 + pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, pz, 6 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Edge vignette
    const vg = ctx.createRadialGradient(S/2, S/2, S*0.32, S/2, S/2, S*0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S, S);

    this._drawCompass(ctx, S);
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

  /**
   * Redraw the minimap. Call each frame (or throttled).
   * @param playerX World X
   * @param playerZ World Z
   * @param playerAngle Camera yaw in radians (0 = +Z)
   */
  update(playerX: number, playerZ: number, playerAngle: number): void {
    if (!this.isVisible) return;

    // World mode redraws every frame for pulse animation — skip throttle
    if (this.viewMode === 'world') {
      const ctx = this.ctx;
      if (!ctx) return;
      this.lastDrawX = playerX;
      this.lastDrawZ = playerZ;
      this.lastDrawAngle = playerAngle;
      ctx.clearRect(0, 0, WM_MAP_SIZE, WM_MAP_SIZE);
      this._drawWorldView(playerX, playerZ);
      this.coordLabel.textContent = `x: ${Math.round(playerX)}  z: ${Math.round(playerZ)}`;
      this.biomeLabel.textContent = BIOME_NAMES[getDominantBiome(playerX, playerZ)] ?? '—';
      return;
    }

    // Throttle: only redraw when player moves significantly or rotates
    this.frameSkip++;
    const dx = playerX - this.lastDrawX;
    const dz = playerZ - this.lastDrawZ;
    const moved = isNaN(this.lastDrawX) || (dx * dx + dz * dz) > 9; // 3m threshold

    let angleDiff = playerAngle - this.lastDrawAngle;
    angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const rotated = isNaN(this.lastDrawAngle) || Math.abs(angleDiff) > 0.1; // ~6 degrees

    // Always update labels, but skip heavy canvas draw
    if (!moved && !rotated && this.frameSkip < 10) {
      this.coordLabel.textContent = `x: ${Math.round(playerX)}  z: ${Math.round(playerZ)}`;
      return;
    }

    this.frameSkip = 0;
    this.lastDrawX = playerX;
    this.lastDrawZ = playerZ;
    this.lastDrawAngle = playerAngle;

    const ctx = this.ctx;
    if (!ctx) return;
    const S = MM_SIZE;
    const scale = MM_SCALE;
    const halfWorld = (S * scale) / 2;

    // ── Terrain ────────────────────────────────────────────────────────────
    ctx.fillStyle = '#12141e';
    ctx.fillRect(0, 0, S, S);

    // Optimization: step=6 instead of 2. iterations: (290/6)^2 = ~2330 vs 21025.
    // 9x performance improvement for the same visual clarity at map scale.
    const step = 6;
    const dominantBiome = getDominantBiome(playerX, playerZ);

    for (let px = 0; px < S; px += step) {
      for (let py = 0; py < S; py += step) {
        const wx = playerX + (px - S / 2) * scale;
        const wz = playerZ + (py - S / 2) * scale;
        const weights = getBiomeWeights(wx, wz);
        let r = 0, g = 0, b = 0;
        for (const [biome, color] of BIOME_COLOR_COMPONENTS) {
          const w = weights[biome];
          if (w > 0.001) { r += color.r * w; g += color.g * w; b += color.b * w; }
        }
        ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
        ctx.fillRect(px, py, step, step);
      }
    }

    // ── Vignette — darken edges so the centre reads clearly ───────────────
    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S, S);

    // ── Grid (chunk boundaries, 64 world-units) ────────────────────────────
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

    // ── NPC dots ───────────────────────────────────────────────────────────
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

    // ── Waypoints ──────────────────────────────────────────────────────────
    for (const waypoint of this.waypoints) {
      const marker = this.getMarkerPoint(waypoint, playerX, playerZ, scale, S);
      if (!marker) continue;
      const highlighted = waypoint.id === this.hoveredWaypointId;
      this.drawWaypointMarker(ctx, marker.x, marker.y, waypoint.kind, highlighted);
      this.drawWaypointLabel(ctx, marker.x, marker.y, waypoint.label, highlighted);
    }

    // ── Player indicator ───────────────────────────────────────────────────
    const cx = S / 2;
    const cy = S / 2;

    // Outer glow ring
    ctx.save();
    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(68,255,136,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Direction chevron
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

    // ── Compass (corners) ──────────────────────────────────────────────────
    this._drawCompass(ctx, S);

    // ── Biome label + coords (updated in DOM elements, not canvas) ─────────
    this.biomeLabel.textContent = BIOME_NAMES[dominantBiome] ?? '—';
    this.coordLabel.textContent = `x: ${Math.round(playerX)}  z: ${Math.round(playerZ)}`;
  }

  get element(): HTMLElement {
    return this.container;
  }

  private handlePointerDown(event: PointerEvent): void {
    const waypoint = this.getWaypointAtEvent(event);
    if (!waypoint) return;
    this.onWaypointClick?.(waypoint);
  }

  private handlePointerMove(event: PointerEvent): void {
    const waypoint = this.getWaypointAtEvent(event);
    this.hoveredWaypointId = waypoint?.id ?? null;
    this.canvas.style.cursor = waypoint ? 'pointer' : 'default';
  }

  private handlePointerLeave(): void {
    this.hoveredWaypointId = null;
    this.canvas.style.cursor = 'default';
  }

  private getWaypointAtEvent(event: PointerEvent): MinimapWaypoint | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return this.getWaypointAtCanvasPoint(x, y);
  }

  private getWaypointAtCanvasPoint(x: number, y: number): MinimapWaypoint | null {
    if (!Number.isFinite(this.lastDrawX) || !Number.isFinite(this.lastDrawZ)) return null;
    const markerRadius = 10;
    let closest: { waypoint: MinimapWaypoint; distanceSq: number } | null = null;
    for (const waypoint of this.waypoints) {
      const marker = this.getMarkerPoint(waypoint, this.lastDrawX, this.lastDrawZ, MM_SCALE, MM_SIZE);
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

// Biome display colors — vivid enough to read clearly on dark canvas.
const BIOME_COLORS: Record<BiomeType, string> = {
  [BiomeType.Teldrassil]: '#2d6b38',    // forest green
  [BiomeType.BlastedSuarezLands]: '#9c3a12',   // lava orange-red
  [BiomeType.CrystalTundra]: '#4a7fa8', // icy blue
  [BiomeType.MoinSwamps]: '#1e5c3a', // swamp teal
  [BiomeType.MalakaArea]: '#7a9422', // meadow yellow-green
  [BiomeType.TanisDesert]: '#9a7230',        // sandy gold
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
