import * as THREE from "three";
import { UIComponent } from "./core/UIComponent";

/**
 * Beautiful WoW-style floating nameplate for NPCs.
 * Renders an elegant gold-text nameplate with a dark panel background,
 * purple/gold border glow, decorative flourishes, and a health bar.
 * The sprite auto-billboards to always face the camera.
 */
export class Nameplate extends UIComponent {
  declare sprite: THREE.Sprite;
  declare private canvas: HTMLCanvasElement;
  declare private ctx: CanvasRenderingContext2D;
  declare private texture: THREE.CanvasTexture;
  declare private material: THREE.SpriteMaterial;
  private _name = "";
  private currentHp = 100;
  private maxHp = 100;
  private _mood = "neutral";
  private _relationshipScore = 0;
  // Static so they are available during render(), which runs before instance fields init
  private static readonly CANVAS_W = 512;
  private static readonly CANVAS_H = 120;

  constructor(name: string, maxHp = 100) {
    super('ui-root', `nameplate-${name}`);
    // render() already ran — canvas/ctx/texture/material/sprite all exist
    this._name = name;
    this.currentHp = maxHp;
    this.maxHp = maxHp;
    this.draw();
  }

  render(): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = Nameplate.CANVAS_W;
    this.canvas.height = Nameplate.CANVAS_H;
    this.ctx = this.canvas.getContext("2d")!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
    });

    // Pass material to constructor — avoids setting sprite.material after creation
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(3, 0.7, 1);
    this.sprite.position.set(0, 3.2, 0);
    this.sprite.renderOrder = 999;
  }

  /** Update the HP bar. `current` and `max` are absolute values. */
  updateHP(current: number, max: number): void {
    this.maxHp = max;
    const prev = this.currentHp;
    this.currentHp = Math.max(0, Math.min(max, current));
    if (prev === this.currentHp) return;
    this.draw();
  }

  /** Update mood and relationship indicators. */
  updateMood(mood: string, relationshipScore: number): void {
    if (mood === this._mood && relationshipScore === this._relationshipScore) return;
    this._mood = mood;
    this._relationshipScore = relationshipScore;
    this.draw();
  }

  protected onDispose(): void {
    if (this.texture) {
      this.texture.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    if (this.canvas) {
      this.canvas.remove();
    }
  }

  // ── Internal drawing ────────────────────────────────────────────────

  private draw(): void {
    const ctx = this.ctx;
    const w = Nameplate.CANVAS_W;
    const h = Nameplate.CANVAS_H;
    if (!ctx) return; // no-op in environments without canvas 2D (e.g. test)
    ctx.clearRect(0, 0, w, h);

    const panelX = 24;
    const panelY = 8;
    const panelW = w - 48;
    const panelH = h - 16;
    const radius = 12;

    // ── Background panel ──────────────────────────────────────────────
    ctx.save();
    this.roundRect(ctx, panelX, panelY, panelW, panelH, radius);
    ctx.fillStyle = "rgba(10, 6, 18, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(197, 165, 90, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── NPC Name text ─────────────────────────────────────────────────
    ctx.font = `bold 28px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textY = 38;

    // Text shadow (dark)
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    ctx.fillText(this._name, w / 2 + 1, textY + 2);

    // Main gold text
    const textGrad = ctx.createLinearGradient(w / 2 - 80, textY - 14, w / 2 + 80, textY + 14);
    textGrad.addColorStop(0, "#d4b86a");
    textGrad.addColorStop(0.3, "#f0dca0");
    textGrad.addColorStop(0.5, "#c5a55a");
    textGrad.addColorStop(0.7, "#f0dca0");
    textGrad.addColorStop(1, "#d4b86a");
    ctx.fillStyle = textGrad;
    ctx.fillText(this._name, w / 2, textY);

    // ── Health bar ────────────────────────────────────────────────────
    this.drawHealthBar(ctx, w);

    // ── Thin relationship-tinted underline ────────────────────────────
    this.drawRelationshipTint(ctx, panelX, panelY, panelW, panelH);

    this.texture.needsUpdate = true;
  }

  /** Relationship color: red (enemy) → yellow (neutral) → green (ally). */
  private relationshipColor(): string {
    if (this._relationshipScore < -30) return "#cc2222";
    if (this._relationshipScore < 10) return "#ccaa22";
    return "#22cc44";
  }

  /** Thin colored bar hugging the panel's bottom edge, tinted by relationship. */
  private drawRelationshipTint(
    ctx: CanvasRenderingContext2D,
    panelX: number,
    panelY: number,
    panelW: number,
    panelH: number,
  ): void {
    const inset = 14;
    const lineH = 4;
    const lineW = panelW - inset * 2;
    const lineX = panelX + inset;
    const lineY = panelY + panelH - 12;

    ctx.save();
    this.roundRect(ctx, lineX, lineY, lineW, lineH, 2);
    ctx.fillStyle = this.relationshipColor();
    ctx.shadowColor = this.relationshipColor();
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, w: number): void {
    const barPad = 80;
    const barY = 64;
    const barH = 14;
    const barW = w - barPad * 2;
    const barRadius = 4;
    const frac = this.maxHp > 0 ? this.currentHp / this.maxHp : 0;

    // Dark frame background
    ctx.save();
    this.roundRect(ctx, barPad - 1, barY - 1, barW + 2, barH + 2, barRadius + 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fill();
    ctx.restore();

    // Inner track
    ctx.save();
    this.roundRect(ctx, barPad, barY, barW, barH, barRadius);
    ctx.fillStyle = "rgba(20, 10, 30, 0.8)";
    ctx.fill();
    ctx.restore();

    // Colored fill
    if (frac > 0) {
      ctx.save();
      // Clip to rounded rect
      this.roundRect(ctx, barPad, barY, barW, barH, barRadius);
      ctx.clip();

      const fillW = barW * frac;
      const hpGrad = ctx.createLinearGradient(barPad, barY, barPad + barW, barY);

      // Green → yellow → red based on HP fraction
      if (frac > 0.5) {
        hpGrad.addColorStop(0, "#1a8a2a");
        hpGrad.addColorStop(0.5, "#2ecc40");
        hpGrad.addColorStop(1, "#5dde70");
      } else if (frac > 0.25) {
        hpGrad.addColorStop(0, "#b8860b");
        hpGrad.addColorStop(0.5, "#daa520");
        hpGrad.addColorStop(1, "#f0c040");
      } else {
        hpGrad.addColorStop(0, "#8b0000");
        hpGrad.addColorStop(0.5, "#cc2222");
        hpGrad.addColorStop(1, "#e04040");
      }

      ctx.fillStyle = hpGrad;
      ctx.fillRect(barPad, barY, fillW, barH);

      // Glossy highlight on top half
      const glossGrad = ctx.createLinearGradient(barPad, barY, barPad, barY + barH);
      glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      glossGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
      ctx.fillStyle = glossGrad;
      ctx.fillRect(barPad, barY, fillW, barH);
      ctx.restore();
    }

    // Gold border around the bar
    ctx.save();
    this.roundRect(ctx, barPad, barY, barW, barH, barRadius);
    ctx.strokeStyle = "rgba(197, 165, 90, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Tiny tick marks at 25%, 50%, 75%
    ctx.strokeStyle = "rgba(197, 165, 90, 0.2)";
    ctx.lineWidth = 1;
    for (const pct of [0.25, 0.5, 0.75]) {
      const tx = barPad + barW * pct;
      ctx.beginPath();
      ctx.moveTo(tx, barY + 2);
      ctx.lineTo(tx, barY + barH - 2);
      ctx.stroke();
    }
  }

  /** Draw a rounded rectangle path (does NOT fill/stroke). */
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
