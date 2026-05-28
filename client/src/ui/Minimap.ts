import { UIComponent } from "./core/UIComponent";
import { BiomeType, getDominantBiome } from '../scene/Biomes';

export interface MinimapWaypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: 'landmark' | 'feature';
}

/**
 * Canvas-based minimap overlay toggled with M key.
 * Extends UIComponent for consistent lifecycle management.
 *
 * Shows:
 *  - Biome-colored terrain
 *  - Player position + direction arrow
 *  - Town markers (house icon)
 *  - Cave markers (diamond icon)
 *  - NPC dots
 */
export class Minimap extends UIComponent {
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;

  // World waypoints
  private waypoints: MinimapWaypoint[] = [];
  private hoveredWaypointId: string | null = null;

  onWaypointClick: ((waypoint: MinimapWaypoint) => void) | null = null;

  // Map config
  private readonly SIZE = 280; // pixel size of the minimap
  private readonly SCALE = 2.0; // world-units per pixel

  // Throttling — only redraw when player moves enough
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

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      width: `${this.SIZE + 4}px`,
      height: `${this.SIZE + 30}px`,
      background: 'rgba(10, 6, 18, 0.85)',
      border: '2px solid rgba(197, 165, 90, 0.5)',
      borderRadius: '8px',
      display: 'none',
      pointerEvents: 'auto',
      zIndex: '1000',
      padding: '2px',
      boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
    } as Partial<CSSStyleDeclaration>);

    // Title bar
    const title = document.createElement('div');
    Object.assign(title.style, {
      textAlign: 'center',
      color: '#c5a55a',
      fontSize: '11px',
      fontFamily: "'Cinzel', serif",
      padding: '3px 0',
      letterSpacing: '2px',
      borderBottom: '1px solid rgba(197, 165, 90, 0.3)',
    } as Partial<CSSStyleDeclaration>);
    title.textContent = 'WORLD MAP [M]';
    this.container.appendChild(title);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.SIZE;
    this.canvas.height = this.SIZE;
    Object.assign(this.canvas.style, {
      display: 'block',
      margin: '2px auto 0',
      borderRadius: '4px',
    } as Partial<CSSStyleDeclaration>);
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
  }

  protected override onShow(): void {
    // Reset throttle so the canvas redraws immediately on next update() call,
    // even if the player hasn't moved since the last time the map was open.
    this.lastDrawX = NaN;
    this.lastDrawZ = NaN;
    this.lastDrawAngle = NaN;
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

  /**
   * Redraw the minimap. Call each frame (or throttled).
   * @param playerX World X
   * @param playerZ World Z
   * @param playerAngle Camera yaw in radians (0 = +Z)
   */
  update(playerX: number, playerZ: number, playerAngle: number): void {
    if (!this.isVisible) return;

    // Throttle: only redraw every 3 frames or when player moves > 2 units
    this.frameSkip++;
    const dx = playerX - this.lastDrawX;
    const dz = playerZ - this.lastDrawZ;
    const moved = isNaN(this.lastDrawX) || (dx * dx + dz * dz) > 4;
    // Wrap angle difference to handle ±π discontinuity
    let angleDiff = playerAngle - this.lastDrawAngle;
    angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const rotated = isNaN(this.lastDrawAngle) || Math.abs(angleDiff) > 0.05;
    if (!moved && !rotated && this.frameSkip < 3) return;
    this.frameSkip = 0;
    this.lastDrawX = playerX;
    this.lastDrawZ = playerZ;
    this.lastDrawAngle = playerAngle;

    const ctx = this.ctx;
    if (!ctx) return; // no-op in environments without canvas 2D (e.g. test)
    const S = this.SIZE;
    const scale = this.SCALE;
    const halfWorld = (S * scale) / 2;

    // Clear
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, S, S);

    // Draw biome-colored terrain pixels (every 4px for performance)
    const step = 4;
    for (let px = 0; px < S; px += step) {
      for (let py = 0; py < S; py += step) {
        const wx = playerX + (px - S / 2) * scale;
        const wz = playerZ + (py - S / 2) * scale;
        const biome = getDominantBiome(wx, wz);
        ctx.fillStyle = BIOME_COLORS[biome] ?? BIOME_COLORS[BiomeType.Teldrassil] ?? '#1a2a1f';
        ctx.fillRect(px, py, step, step);
      }
    }

    // Draw grid lines (every 64 units = chunk boundary)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    const chunkSize = 64;
    const startWX = playerX - halfWorld;
    const startWZ = playerZ - halfWorld;
    const firstChunkX = Math.ceil(startWX / chunkSize) * chunkSize;
    const firstChunkZ = Math.ceil(startWZ / chunkSize) * chunkSize;

    for (let wx = firstChunkX; wx < playerX + halfWorld; wx += chunkSize) {
      const px = (wx - playerX) / scale + S / 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, S);
      ctx.stroke();
    }
    for (let wz = firstChunkZ; wz < playerZ + halfWorld; wz += chunkSize) {
      const py = (wz - playerZ) / scale + S / 2;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(S, py);
      ctx.stroke();
    }

    // Draw waypoints
    for (const waypoint of this.waypoints) {
      const marker = this.getMarkerPoint(waypoint, playerX, playerZ, scale, S);
      if (!marker) continue;

      const highlighted = waypoint.id === this.hoveredWaypointId;
      this.drawWaypointMarker(ctx, marker.x, marker.y, waypoint.kind, highlighted);
      this.drawWaypointLabel(ctx, marker.x, marker.y, waypoint.label, highlighted);
    }

    // Player arrow (center)
    const cx = S / 2;
    const cy = S / 2;
    const arrowLen = 8;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(playerAngle);

    // Arrow body
    ctx.fillStyle = '#44ff88';
    ctx.beginPath();
    ctx.moveTo(0, -arrowLen);
    ctx.lineTo(-5, arrowLen * 0.5);
    ctx.lineTo(0, arrowLen * 0.2);
    ctx.lineTo(5, arrowLen * 0.5);
    ctx.closePath();
    ctx.fill();

    // Arrow outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();

    // Compass labels
    ctx.fillStyle = 'rgba(200, 180, 255, 0.6)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 10);
    ctx.fillText('S', S / 2, S - 3);
    ctx.fillText('W', 8, S / 2 + 3);
    ctx.fillText('E', S - 8, S / 2 + 3);

    // Coordinate readout
    ctx.fillStyle = 'rgba(200, 180, 255, 0.5)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(playerX)}, ${Math.round(playerZ)}`, 4, S - 3);
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
      const marker = this.getMarkerPoint(waypoint, this.lastDrawX, this.lastDrawZ, this.SCALE, this.SIZE);
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

// Biome display colors for the minimap
const BIOME_COLORS: Partial<Record<BiomeType, string>> = {
  [BiomeType.Teldrassil]: '#1a2a1f',
  [BiomeType.EmberWastes]: '#3a1508',
  [BiomeType.CrystalTundra]: '#4a5a6a',
  [BiomeType.TwilightMarsh]: '#0a1a0a',
  [BiomeType.SunlitMeadows]: '#3a4a1a',
};
