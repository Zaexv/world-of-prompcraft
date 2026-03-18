import * as THREE from 'three';

/**
 * Floating action icon above an NPC — shows what the NPC is currently doing.
 * Renders an emoji/icon on a canvas texture as a billboard sprite.
 * Automatically fades out after a duration.
 */

const ICON_MAP: Record<string, string> = {
  // Combat
  damage: '⚔️',
  attack: '⚔️',
  defend: '🛡️',
  flee: '🏃',
  // Dialogue
  emote: '💬',
  wave: '👋',
  bow: '🙇',
  laugh: '😄',
  threaten: '😠',
  dance: '💃',
  cry: '😢',
  cheer: '🎉',
  // Healing
  heal: '❤️',
  holy_light: '✨',
  // Trade
  give_item: '🎁',
  take_item: '💰',
  offer_item: '🛒',
  // Environment
  change_weather: '🌧️',
  spawn_effect: '✨',
  fire: '🔥',
  ice: '❄️',
  lightning: '⚡',
  // Quest
  start_quest: '📜',
  complete_quest: '🏆',
  // Generic
  thinking: '💭',
  move_npc: '🚶',
};

export class ActionIcon {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private material: THREE.SpriteMaterial;

  private fadeTimer = 0;
  private fadeDuration = 3.0;
  private isActive = false;
  private pulsePhase = 0;

  constructor() {
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
      opacity: 0,
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(1.2, 1.2, 1);
    this.sprite.position.y = 4.2; // Above the nameplate
    this.sprite.renderOrder = 1000;
  }

  /**
   * Show an action icon above the NPC.
   * @param actionKind - the action kind (e.g. "damage", "heal", "emote") or specific emote name
   * @param duration - how long to show (default 3s)
   */
  show(actionKind: string, duration = 3.0): void {
    const icon = ICON_MAP[actionKind] ?? '❓';
    this.renderIcon(icon);
    this.fadeDuration = duration;
    this.fadeTimer = 0;
    this.pulsePhase = 0;
    this.isActive = true;
    this.material.opacity = 1;
  }

  /** Hide immediately. */
  hide(): void {
    this.isActive = false;
    this.material.opacity = 0;
  }

  /** Call every frame. Returns false when fully faded. */
  update(delta: number): boolean {
    if (!this.isActive) return false;

    this.fadeTimer += delta;
    this.pulsePhase += delta;

    // Gentle pulse scale
    const pulse = 1 + Math.sin(this.pulsePhase * 4) * 0.08;
    this.sprite.scale.set(1.2 * pulse, 1.2 * pulse, 1);

    // Fade out in the last 0.8 seconds
    const fadeStart = this.fadeDuration - 0.8;
    if (this.fadeTimer > fadeStart) {
      const t = (this.fadeTimer - fadeStart) / 0.8;
      this.material.opacity = Math.max(0, 1 - t);
    }

    // Bob up slightly while active
    this.sprite.position.y = 4.2 + Math.sin(this.pulsePhase * 2) * 0.1;

    if (this.fadeTimer >= this.fadeDuration) {
      this.isActive = false;
      this.material.opacity = 0;
      return false;
    }

    return true;
  }

  get active(): boolean {
    return this.isActive;
  }

  private renderIcon(emoji: string): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark circular background with gold border
    const cx = w / 2;
    const cy = h / 2;
    const radius = 48;

    // Shadow
    ctx.beginPath();
    ctx.arc(cx, cy + 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();

    // Background
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy - 10, 0, cx, cy, radius);
    grad.addColorStop(0, 'rgba(30, 20, 50, 0.9)');
    grad.addColorStop(1, 'rgba(10, 6, 18, 0.95)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Gold border
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(197, 165, 90, 0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Outer glow
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(102, 51, 170, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Emoji
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(emoji, cx, cy + 2);

    this.texture.needsUpdate = true;
  }
}
