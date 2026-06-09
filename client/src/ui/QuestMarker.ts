import * as THREE from 'three';
import { UIComponent } from './core/UIComponent';

/**
 * Persistent quest-giver marker — a glowing gold "!" that floats above an NPC
 * who owns a quest. Unlike {@link ActionIcon} it never fades; it billboards to
 * the camera and bobs gently so it reads as an interactive marker.
 */
export class QuestMarker extends UIComponent {
  declare sprite: THREE.Sprite;
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;
  declare private texture: THREE.CanvasTexture;
  declare private material: THREE.SpriteMaterial;

  private bobPhase = Math.random() * Math.PI * 2;
  private static readonly BASE_Y = 4.5;

  constructor() {
    super('ui-root', 'quest-marker');
    // render() already ran — canvas/ctx/texture/material/sprite all exist
    this.draw();
  }

  render(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(0.9, 0.9, 1);
    this.sprite.position.y = QuestMarker.BASE_Y;
    this.sprite.renderOrder = 1000;
  }

  private draw(): void {
    const ctx = this.ctx;
    const c = 64; // center
    ctx.clearRect(0, 0, 128, 128);

    // Soft golden glow halo
    const glow = ctx.createRadialGradient(c, c, 4, c, c, 60);
    glow.addColorStop(0, 'rgba(255, 215, 0, 0.55)');
    glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c, c, 60, 0, Math.PI * 2);
    ctx.fill();

    // The "!" — gold fill with a dark outline for contrast against any backdrop
    ctx.font = 'bold 92px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(40, 25, 0, 0.95)';
    ctx.strokeText('!', c, c + 4);
    const fill = ctx.createLinearGradient(0, 20, 0, 108);
    fill.addColorStop(0, '#fff3b0');
    fill.addColorStop(0.5, '#ffd700');
    fill.addColorStop(1, '#e0a000');
    ctx.fillStyle = fill;
    ctx.fillText('!', c, c + 4);

    this.texture.needsUpdate = true;
  }

  /** Call every frame for the gentle bob. */
  update(delta: number): void {
    this.bobPhase += delta * 2;
    this.sprite.position.y = QuestMarker.BASE_Y + Math.sin(this.bobPhase) * 0.12;
  }

  dispose(): void {
    this.material.dispose();
    this.texture.dispose();
  }
}
