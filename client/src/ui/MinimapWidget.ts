import { UIComponent } from "./core/UIComponent";
import { BiomeType, getDominantBiome } from '../scene/Biomes';
import type { MinimapNPCDot } from './Minimap';

const SM_SIZE  = 152; // canvas pixels
const SM_SCALE = 0.9; // world-units per canvas pixel → ~68 units radius

/**
 * Small circular minimap always visible in the bottom-right corner.
 * Shows terrain and nearby NPCs/player; no waypoint labels.
 */
export class MinimapWidget extends UIComponent {
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;

  private npcDots: MinimapNPCDot[] = [];
  private lastDrawX = NaN;
  private lastDrawZ = NaN;
  private lastDrawAngle = NaN;
  private frameSkip = 0;

  constructor() {
    super('ui-root', 'minimap-widget');
    // Always visible — show immediately after render() runs
    this.show();
  }

  render(): void {
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: `${SM_SIZE}px`,
      height: `${SM_SIZE}px`,
      borderRadius: '50%',
      border: '1px solid rgba(197,165,90,0.45)',
      boxShadow: '0 2px 14px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(255,255,255,0.04)',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '50',
    } as Partial<CSSStyleDeclaration>);

    this.canvas = document.createElement('canvas');
    this.canvas.width = SM_SIZE;
    this.canvas.height = SM_SIZE;
    Object.assign(this.canvas.style, {
      display: 'block',
      width: `${SM_SIZE}px`,
      height: `${SM_SIZE}px`,
    } as Partial<CSSStyleDeclaration>);
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
  }

  protected override onShow(): void {
    // UIComponent.show() sets display:'block' which is correct here.
    // Reset throttle so first update draws immediately.
    this.lastDrawX = NaN;
    this.lastDrawZ = NaN;
    this.lastDrawAngle = NaN;
  }

  setNPCDots(dots: MinimapNPCDot[]): void {
    this.npcDots = dots;
  }

  update(playerX: number, playerZ: number, playerAngle: number): void {
    if (!this.isVisible) return;

    this.frameSkip++;
    const dx = playerX - this.lastDrawX;
    const dz = playerZ - this.lastDrawZ;
    const moved = isNaN(this.lastDrawX) || (dx * dx + dz * dz) > 1;
    let angleDiff = playerAngle - this.lastDrawAngle;
    angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const rotated = isNaN(this.lastDrawAngle) || Math.abs(angleDiff) > 0.03;
    if (!moved && !rotated && this.frameSkip < 2) return;
    this.frameSkip = 0;
    this.lastDrawX = playerX;
    this.lastDrawZ = playerZ;
    this.lastDrawAngle = playerAngle;

    const ctx = this.ctx;
    if (!ctx) return;
    const S = SM_SIZE;
    const scale = SM_SCALE;
    const half = S / 2;

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();

    // Terrain
    ctx.fillStyle = '#12141e';
    ctx.fillRect(0, 0, S, S);
    for (let px = 0; px < S; px++) {
      for (let py = 0; py < S; py++) {
        const wx = playerX + (px - half) * scale;
        const wz = playerZ + (py - half) * scale;
        const biome = getDominantBiome(wx, wz);
        ctx.fillStyle = BIOME_COLORS[biome];
        ctx.fillRect(px, py, 1, 1);
      }
    }

    // Vignette
    const vg = ctx.createRadialGradient(half, half, half * 0.3, half, half, half);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S, S);

    // NPC dots
    for (const npc of this.npcDots) {
      const nx = (npc.x - playerX) / scale + half;
      const nz = (npc.z - playerZ) / scale + half;
      if (nx < 0 || nx > S || nz < 0 || nz > S) continue;
      ctx.save();
      ctx.shadowColor = npc.hostile ? '#ff4444' : '#44ff88';
      ctx.shadowBlur = 3;
      ctx.fillStyle = npc.hostile ? '#ff6644' : '#88ffaa';
      ctx.beginPath();
      ctx.arc(nx, nz, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Player direction chevron
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(playerAngle);
    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#44ff88';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-4, 3);
    ctx.lineTo(0, 1);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();

    // Compass labels
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = 'rgba(197,165,90,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('N', half, 9);
    ctx.fillText('S', half, S - 2);
    ctx.textAlign = 'left';
    ctx.fillText('W', 3, half + 3);
    ctx.textAlign = 'right';
    ctx.fillText('E', S - 3, half + 3);

    ctx.restore(); // restore clip
  }

  get element(): HTMLElement {
    return this.container;
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
