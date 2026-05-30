import { UIComponent } from "./core/UIComponent";
import { BiomeType, getDominantBiome } from '../scene/Biomes';

const WM_SIZE  = 560; // canvas pixels
const WM_SCALE = 3.5; // world-units per canvas pixel (shows ~490 units radius)

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
 * Large full-screen modal world map toggled with M key.
 * Click backdrop or press ESC to close.
 */
export class Minimap extends UIComponent {
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;
  declare private biomeLabel: HTMLDivElement;
  declare private coordLabel: HTMLDivElement;

  private waypoints: MinimapWaypoint[] = [];
  private npcDots: MinimapNPCDot[] = [];
  private hoveredWaypointId: string | null = null;

  onWaypointClick: ((waypoint: MinimapWaypoint) => void) | null = null;

  private lastDrawX = NaN;
  private lastDrawZ = NaN;
  private lastDrawAngle = NaN;
  private frameSkip = 0;

  private readonly escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isVisible) this.hide();
  };

  constructor() {
    super('ui-root', 'minimap');
    this.canvas.style.cursor = 'default';
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave.bind(this));
    window.addEventListener('keydown', this.escHandler);
  }

  setNPCDots(dots: MinimapNPCDot[]): void {
    this.npcDots = dots;
  }

  render(): void {
    // Container is the full-screen backdrop
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.65)',
      zIndex: '200',
      backdropFilter: 'blur(2px)',
    } as Partial<CSSStyleDeclaration>);

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.hide();
    });

    // ── Inner panel ────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(8, 6, 18, 0.97)',
      border: '1px solid rgba(197, 165, 90, 0.5)',
      borderRadius: '10px',
      boxShadow: '0 8px 48px rgba(0,0,0,0.9), inset 0 1px 0 rgba(197,165,90,0.15)',
      overflow: 'hidden',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    // ── Title bar ──────────────────────────────────────────────────────────
    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 14px',
      borderBottom: '1px solid rgba(197, 165, 90, 0.25)',
      background: 'rgba(0,0,0,0.3)',
    } as Partial<CSSStyleDeclaration>);

    const titleText = document.createElement('span');
    Object.assign(titleText.style, {
      color: '#c5a55a',
      fontSize: '12px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '3px',
      textTransform: 'uppercase',
      fontWeight: '700',
    } as Partial<CSSStyleDeclaration>);
    titleText.textContent = 'World Map';

    this.biomeLabel = document.createElement('div');
    Object.assign(this.biomeLabel.style, {
      color: '#888',
      fontSize: '9px',
      fontFamily: "'Cinzel', serif",
      letterSpacing: '1px',
      fontStyle: 'italic',
    } as Partial<CSSStyleDeclaration>);
    this.biomeLabel.textContent = '—';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      color: 'rgba(197,165,90,0.6)',
      cursor: 'pointer',
      fontSize: '15px',
      padding: '0 2px',
      lineHeight: '1',
      transition: 'color 0.15s',
    } as Partial<CSSStyleDeclaration>);
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#c5a55a'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = 'rgba(197,165,90,0.6)'; });
    closeBtn.addEventListener('click', () => this.hide());

    titleBar.appendChild(titleText);
    titleBar.appendChild(this.biomeLabel);
    titleBar.appendChild(closeBtn);
    panel.appendChild(titleBar);

    // ── Canvas ─────────────────────────────────────────────────────────────
    this.canvas = document.createElement('canvas');
    this.canvas.width = WM_SIZE;
    this.canvas.height = WM_SIZE;
    Object.assign(this.canvas.style, {
      display: 'block',
      width: `${WM_SIZE}px`,
      height: `${WM_SIZE}px`,
      margin: '6px',
      borderRadius: '4px',
    } as Partial<CSSStyleDeclaration>);
    panel.appendChild(this.canvas);

    // ── Footer: coordinates + biome legend ────────────────────────────────
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      borderTop: '1px solid rgba(197,165,90,0.15)',
      padding: '6px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
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
      ['#1e5c3a', 'Marsh'], ['#7a9422', 'Meadow'], ['#9a7230', 'Desert'],
    ];
    const legendRow = document.createElement('div');
    Object.assign(legendRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '3px 12px',
      justifyContent: 'center',
    } as Partial<CSSStyleDeclaration>);
    for (const [color, label] of legendEntries) {
      const entry = document.createElement('div');
      Object.assign(entry.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '9px',
        color: 'rgba(197,165,90,0.55)',
        fontFamily: "'Cinzel', serif",
      } as Partial<CSSStyleDeclaration>);
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        width: '8px', height: '8px', borderRadius: '2px',
        background: color, flexShrink: '0',
      } as Partial<CSSStyleDeclaration>);
      entry.appendChild(dot);
      entry.appendChild(document.createTextNode(label));
      legendRow.appendChild(entry);
    }
    footer.appendChild(legendRow);
    panel.appendChild(footer);

    this.container.appendChild(panel);
    this.ctx = this.canvas.getContext('2d')!;
  }

  protected override onShow(): void {
    this.container.style.display = 'flex';
    this.lastDrawX = NaN;
    this.lastDrawZ = NaN;
    this.lastDrawAngle = NaN;
  }

  setWaypoints(waypoints: MinimapWaypoint[]): void {
    this.waypoints = waypoints.map((w) => ({ ...w }));
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

  update(playerX: number, playerZ: number, playerAngle: number): void {
    if (!this.isVisible) return;

    this.frameSkip++;
    const dx = playerX - this.lastDrawX;
    const dz = playerZ - this.lastDrawZ;
    const moved = isNaN(this.lastDrawX) || (dx * dx + dz * dz) > 4;
    let angleDiff = playerAngle - this.lastDrawAngle;
    angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const rotated = isNaN(this.lastDrawAngle) || Math.abs(angleDiff) > 0.05;
    if (!moved && !rotated && this.frameSkip < 3) return;
    this.frameSkip = 0;
    this.lastDrawX = playerX;
    this.lastDrawZ = playerZ;
    this.lastDrawAngle = playerAngle;

    const ctx = this.ctx;
    if (!ctx) return;
    const S = WM_SIZE;
    const scale = WM_SCALE;
    const halfWorld = (S * scale) / 2;

    ctx.fillStyle = '#12141e';
    ctx.fillRect(0, 0, S, S);

    const step = 2;
    let dominantBiome = BiomeType.Teldrassil;
    for (let px = 0; px < S; px += step) {
      for (let py = 0; py < S; py += step) {
        const wx = playerX + (px - S / 2) * scale;
        const wz = playerZ + (py - S / 2) * scale;
        const biome = getDominantBiome(wx, wz);
        ctx.fillStyle = BIOME_COLORS[biome];
        ctx.fillRect(px, py, step, step);
        const ddx = px - S / 2, ddy = py - S / 2;
        if (ddx * ddx + ddy * ddy < 20 * 20) dominantBiome = biome;
      }
    }

    // Vignette
    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S, S);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    const chunkSize = 64;
    const firstChunkX = Math.ceil((playerX - halfWorld) / chunkSize) * chunkSize;
    const firstChunkZ = Math.ceil((playerZ - halfWorld) / chunkSize) * chunkSize;
    for (let wx = firstChunkX; wx < playerX + halfWorld; wx += chunkSize) {
      const px = (wx - playerX) / scale + S / 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, S); ctx.stroke();
    }
    for (let wz = firstChunkZ; wz < playerZ + halfWorld; wz += chunkSize) {
      const py = (wz - playerZ) / scale + S / 2;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(S, py); ctx.stroke();
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

    // Compass
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(197,165,90,0.75)';
    ctx.fillText('N', S / 2, 13);
    ctx.fillText('S', S / 2, S - 3);
    ctx.textAlign = 'left';
    ctx.fillText('W', 4, S / 2 + 4);
    ctx.textAlign = 'right';
    ctx.fillText('E', S - 4, S / 2 + 4);

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
      const marker = this.getMarkerPoint(waypoint, this.lastDrawX, this.lastDrawZ, WM_SCALE, WM_SIZE);
      if (!marker) continue;
      const ddx = x - marker.x;
      const ddy = y - marker.y;
      const distanceSq = ddx * ddx + ddy * ddy;
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
    ctx.font = '9px monospace';
    const width = ctx.measureText(label).width;
    const boxX = x + 8;
    const boxY = y - 11;
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
  [BiomeType.EmberWastes]: '#9c3a12',
  [BiomeType.CrystalTundra]: '#4a7fa8',
  [BiomeType.TwilightMarsh]: '#1e5c3a',
  [BiomeType.SunlitMeadows]: '#7a9422',
  [BiomeType.Desert]: '#9a7230',
};

const BIOME_NAMES: Record<BiomeType, string> = {
  [BiomeType.Teldrassil]: 'Teldrassil',
  [BiomeType.EmberWastes]: 'Ember Wastes',
  [BiomeType.CrystalTundra]: 'Crystal Tundra',
  [BiomeType.TwilightMarsh]: 'Twilight Marsh',
  [BiomeType.SunlitMeadows]: 'Sunlit Meadows',
  [BiomeType.Desert]: 'Desert',
};
