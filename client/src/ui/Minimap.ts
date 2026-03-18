import { BiomeType, getDominantBiome } from '../scene/Biomes';

/**
 * Canvas-based minimap overlay toggled with M key.
 *
 * Shows:
 *  - Biome-colored terrain
 *  - Player position + direction arrow
 *  - Town markers (house icon)
 *  - Cave markers (diamond icon)
 *  - NPC dots
 */
export class Minimap {
  readonly element: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _visible = false;

  // World markers
  private towns: { x: number; z: number }[] = [];
  private caves: { x: number; z: number }[] = [];

  // Map config
  private readonly SIZE = 280; // pixel size of the minimap
  private readonly SCALE = 2.0; // world-units per pixel

  // Throttling — only redraw when player moves enough
  private lastDrawX = NaN;
  private lastDrawZ = NaN;
  private lastDrawAngle = NaN;
  private frameSkip = 0;

  get isVisible(): boolean {
    return this._visible;
  }

  constructor() {
    this.element = document.createElement('div');
    Object.assign(this.element.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: `${this.SIZE + 4}px`,
      height: `${this.SIZE + 30}px`,
      background: 'rgba(10, 6, 18, 0.85)',
      border: '2px solid rgba(170, 68, 255, 0.5)',
      borderRadius: '8px',
      display: 'none',
      pointerEvents: 'auto',
      zIndex: '20',
      padding: '2px',
      boxShadow: '0 0 20px rgba(100, 50, 180, 0.3)',
    } as Partial<CSSStyleDeclaration>);

    // Title bar
    const title = document.createElement('div');
    Object.assign(title.style, {
      textAlign: 'center',
      color: '#ccbbee',
      fontSize: '11px',
      fontFamily: "'Cinzel', serif",
      padding: '3px 0',
      letterSpacing: '2px',
      borderBottom: '1px solid rgba(170, 68, 255, 0.3)',
    } as Partial<CSSStyleDeclaration>);
    title.textContent = 'WORLD MAP [M]';
    this.element.appendChild(title);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.SIZE;
    this.canvas.height = this.SIZE;
    Object.assign(this.canvas.style, {
      display: 'block',
      margin: '2px auto 0',
      borderRadius: '4px',
    } as Partial<CSSStyleDeclaration>);
    this.element.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
  }

  toggle(): void {
    this._visible = !this._visible;
    this.element.style.display = this._visible ? 'block' : 'none';
  }

  show(): void {
    this._visible = true;
    this.element.style.display = 'block';
  }

  hide(): void {
    this._visible = false;
    this.element.style.display = 'none';
  }

  addTown(x: number, z: number): void {
    this.towns.push({ x, z });
  }

  addCave(x: number, z: number): void {
    this.caves.push({ x, z });
  }

  /**
   * Redraw the minimap. Call each frame (or throttled).
   * @param playerX World X
   * @param playerZ World Z
   * @param playerAngle Camera yaw in radians (0 = +Z)
   */
  update(playerX: number, playerZ: number, playerAngle: number): void {
    if (!this._visible) return;

    // Throttle: only redraw every 3 frames or when player moves > 2 units
    this.frameSkip++;
    const dx = playerX - this.lastDrawX;
    const dz = playerZ - this.lastDrawZ;
    const moved = isNaN(this.lastDrawX) || (dx * dx + dz * dz) > 4;
    const rotated = isNaN(this.lastDrawAngle) || Math.abs(playerAngle - this.lastDrawAngle) > 0.05;
    if (!moved && !rotated && this.frameSkip < 3) return;
    this.frameSkip = 0;
    this.lastDrawX = playerX;
    this.lastDrawZ = playerZ;
    this.lastDrawAngle = playerAngle;

    const ctx = this.ctx;
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
        ctx.fillStyle = BIOME_COLORS[biome];
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

    // Draw town markers
    for (const town of this.towns) {
      const px = (town.x - playerX) / scale + S / 2;
      const py = (town.z - playerZ) / scale + S / 2;
      if (px < -10 || px > S + 10 || py < -10 || py > S + 10) continue;

      // House icon
      ctx.fillStyle = '#ffcc44';
      ctx.beginPath();
      ctx.moveTo(px - 4, py + 3);
      ctx.lineTo(px + 4, py + 3);
      ctx.lineTo(px + 4, py - 1);
      ctx.lineTo(px, py - 4);
      ctx.lineTo(px - 4, py - 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#aa8800';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Draw cave markers
    for (const cave of this.caves) {
      const px = (cave.x - playerX) / scale + S / 2;
      const py = (cave.z - playerZ) / scale + S / 2;
      if (px < -10 || px > S + 10 || py < -10 || py > S + 10) continue;

      // Diamond icon
      ctx.fillStyle = '#8866cc';
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px + 3, py);
      ctx.lineTo(px, py + 4);
      ctx.lineTo(px - 3, py);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5533aa';
      ctx.lineWidth = 0.8;
      ctx.stroke();
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
}

// Biome display colors for the minimap
const BIOME_COLORS: Record<BiomeType, string> = {
  [BiomeType.Teldrassil]: '#1a2a1f',
  [BiomeType.EmberWastes]: '#3a1508',
  [BiomeType.CrystalTundra]: '#4a5a6a',
  [BiomeType.TwilightMarsh]: '#0a1a0a',
  [BiomeType.SunlitMeadows]: '#3a4a1a',
};
