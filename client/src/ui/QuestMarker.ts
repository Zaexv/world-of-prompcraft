import * as THREE from 'three';
import { UIComponent } from './core/UIComponent';

/**
 * Persistent golden "!" billboard floating above quest-giver NPCs — the classic
 * RPG "this NPC has something for you" cue. Unlike {@link ActionIcon} it never
 * fades; it gently bobs and pulses so it reads as alive and draws the eye from
 * a distance. Added to the NPC mesh group, so it billboards and scales with the
 * NPC. Can be toggled off (e.g. once the player has taken the quest).
 */
export class QuestMarker extends UIComponent {
  declare sprite: THREE.Sprite;
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;
  declare private texture: THREE.CanvasTexture;
  declare private material: THREE.SpriteMaterial;

  private phase = 0;
  private static readonly BASE_Y = 2.95;

  constructor() {
    super('ui-root', 'quest-marker');
    // render() already ran — sprite/canvas/ctx/texture/material all exist
    this.drawMark();
  }

  render(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(0.9, 0.9, 1);
    this.sprite.position.y = QuestMarker.BASE_Y;
    this.sprite.renderOrder = 998;
  }

  /** Show or hide the marker (e.g. hide once the quest is accepted/completed). */
  setVisible(on: boolean): void {
    this.sprite.visible = on;
  }

  /** Call every frame — gentle bob + pulse so the marker feels alive. */
  update(delta: number): void {
    if (!this.sprite.visible) return;
    this.phase += delta;
    const pulse = 1 + Math.sin(this.phase * 3) * 0.1;
    this.sprite.scale.set(0.9 * pulse, 0.9 * pulse, 1);
    this.sprite.position.y = QuestMarker.BASE_Y + Math.sin(this.phase * 1.6) * 0.12;
  }

  protected onDispose(): void {
    if (this.texture) this.texture.dispose();
    if (this.material) this.material.dispose();
    if (this.canvas) this.canvas.remove();
  }

  private drawMark(): void {
    const { ctx, canvas } = this;
    if (!ctx) return; // no-op without canvas 2D (e.g. tests)
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Soft golden glow halo behind the mark.
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
    glow.addColorStop(0, 'rgba(255, 220, 120, 0.55)');
    glow.addColorStop(1, 'rgba(255, 200, 90, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // The "!" — gold gradient with a dark outline for contrast against any sky.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 96px Georgia, "Times New Roman", serif';

    // Dark outline.
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(40, 20, 5, 0.95)';
    ctx.strokeText('!', cx, cy + 4);

    // Gold fill.
    const grad = ctx.createLinearGradient(cx, cy - 44, cx, cy + 44);
    grad.addColorStop(0, '#fff3c4');
    grad.addColorStop(0.4, '#f0c84a');
    grad.addColorStop(0.6, '#e0a82a');
    grad.addColorStop(1, '#c58a1a');
    ctx.fillStyle = grad;
    ctx.fillText('!', cx, cy + 4);

    this.texture.needsUpdate = true;
  }
}
