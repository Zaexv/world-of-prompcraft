import * as THREE from "three";

/**
 * Beautiful WoW-style floating nameplate for NPCs.
 * Renders an elegant gold-text nameplate with a dark panel background,
 * purple/gold border glow, decorative flourishes, and a health bar.
 * The sprite auto-billboards to always face the camera.
 */
export class Nameplate {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private _name: string;
  private currentHp: number;
  private maxHp: number;
  private _mood = "neutral";
  private _relationshipScore = 0;
  private readonly canvasW = 512;
  private readonly canvasH = 160;

  constructor(name: string, maxHp = 100) {
    this._name = name;
    this.currentHp = maxHp;
    this.maxHp = maxHp;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvasW;
    this.canvas.height = this.canvasH;
    this.ctx = this.canvas.getContext("2d")!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(3, 0.94, 1);
    this.sprite.position.set(0, 3.2, 0);
    this.sprite.renderOrder = 999;

    this.draw();
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

  // ── Internal drawing ────────────────────────────────────────────────

  private draw(): void {
    const { ctx, canvasW: w, canvasH: h } = this;
    ctx.clearRect(0, 0, w, h);

    const panelX = 24;
    const panelY = 8;
    const panelW = w - 48;
    const panelH = h - 16;
    const radius = 14;

    // ── Outer glow (purple/gold ethereal border) ──────────────────────
    ctx.save();
    ctx.shadowColor = "rgba(102, 51, 170, 0.6)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    this.roundRect(ctx, panelX - 2, panelY - 2, panelW + 4, panelH + 4, radius + 2);
    ctx.fillStyle = "rgba(102, 51, 170, 0.15)";
    ctx.fill();
    ctx.restore();

    // ── Background panel ──────────────────────────────────────────────
    ctx.save();
    this.roundRect(ctx, panelX, panelY, panelW, panelH, radius);
    ctx.fillStyle = "rgba(10, 6, 18, 0.7)";
    ctx.fill();

    // Subtle inner gradient overlay for depth
    const innerGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    innerGrad.addColorStop(0, "rgba(197, 165, 90, 0.08)");
    innerGrad.addColorStop(0.5, "rgba(102, 51, 170, 0.04)");
    innerGrad.addColorStop(1, "rgba(10, 6, 18, 0.0)");
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // Gold border stroke
    ctx.strokeStyle = "rgba(197, 165, 90, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── Decorative flourish lines on either side ──────────────────────
    this.drawFlourish(ctx, w / 2, 50, panelW * 0.35);

    // ── NPC Name text ─────────────────────────────────────────────────
    const fontSize = 28;
    ctx.font = `bold ${fontSize}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textY = 38;

    // Outer glow behind text
    ctx.save();
    ctx.shadowColor = "rgba(197, 165, 90, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
    ctx.fillText(this._name, w / 2, textY);
    ctx.restore();

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
    this.drawHealthBar(ctx, w, h);

    // ── Mood & relationship indicators ────────────────────────────────
    this.drawMoodRelationship(ctx, w);

    this.texture.needsUpdate = true;
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, w: number, _h: number): void {
    const barPad = 80;
    const barY = 68;
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

  private static readonly MOOD_MAP: Record<string, { emoji: string; color: string }> = {
    neutral: { emoji: "😐", color: "#888888" },
    happy: { emoji: "😊", color: "#44cc44" },
    pleased: { emoji: "🙂", color: "#88cc44" },
    angry: { emoji: "😠", color: "#cc4444" },
    annoyed: { emoji: "😒", color: "#cc8844" },
    sad: { emoji: "😢", color: "#4488cc" },
    fearful: { emoji: "😰", color: "#8844cc" },
    amused: { emoji: "😄", color: "#cccc44" },
  };

  private drawMoodRelationship(ctx: CanvasRenderingContext2D, w: number): void {
    const y = 92;
    const barPad = 80;

    // Mood emoji + label (left side)
    const moodInfo = Nameplate.MOOD_MAP[this._mood] ?? Nameplate.MOOD_MAP.neutral;
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(moodInfo.emoji, barPad, y + 8);

    ctx.font = "bold 11px Georgia, serif";
    ctx.fillStyle = moodInfo.color;
    ctx.fillText(this._mood.toUpperCase(), barPad + 22, y + 8);

    // Relationship bar (right side) — thin horizontal bar
    const relBarX = w / 2 + 20;
    const relBarW = w - barPad - relBarX;
    const relBarH = 6;
    const relBarY = y + 5;

    // Label
    ctx.font = "bold 10px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(197, 165, 90, 0.6)";
    ctx.fillText("REP", w / 2 - 4, y + 8);

    // Background track
    ctx.save();
    this.roundRect(ctx, relBarX, relBarY, relBarW, relBarH, 3);
    ctx.fillStyle = "rgba(20, 10, 30, 0.8)";
    ctx.fill();
    ctx.restore();

    // Filled portion: map -100..100 → 0..1
    const frac = (this._relationshipScore + 100) / 200;
    const fillW = relBarW * Math.max(0, Math.min(1, frac));

    if (fillW > 0) {
      ctx.save();
      this.roundRect(ctx, relBarX, relBarY, relBarW, relBarH, 3);
      ctx.clip();

      // Color: red (enemy) → yellow (neutral) → green (ally)
      let barColor: string;
      if (this._relationshipScore < -30) {
        barColor = "#cc2222";
      } else if (this._relationshipScore < 10) {
        barColor = "#ccaa22";
      } else {
        barColor = "#22cc44";
      }
      ctx.fillStyle = barColor;
      ctx.fillRect(relBarX, relBarY, fillW, relBarH);
      ctx.restore();
    }

    // Border
    ctx.save();
    this.roundRect(ctx, relBarX, relBarY, relBarW, relBarH, 3);
    ctx.strokeStyle = "rgba(197, 165, 90, 0.4)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawFlourish(
    ctx: CanvasRenderingContext2D,
    cx: number,
    y: number,
    halfWidth: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = "rgba(197, 165, 90, 0.3)";
    ctx.lineWidth = 1;

    // Left flourish: gentle curve
    ctx.beginPath();
    ctx.moveTo(cx - 60, y);
    ctx.lineTo(cx - halfWidth + 10, y);
    ctx.quadraticCurveTo(cx - halfWidth, y, cx - halfWidth, y - 6);
    ctx.stroke();

    // Right flourish: mirror
    ctx.beginPath();
    ctx.moveTo(cx + 60, y);
    ctx.lineTo(cx + halfWidth - 10, y);
    ctx.quadraticCurveTo(cx + halfWidth, y, cx + halfWidth, y - 6);
    ctx.stroke();

    // Small diamond at each end
    for (const side of [-1, 1]) {
      const dx = cx + side * (halfWidth + 2);
      const dy = y - 8;
      ctx.fillStyle = "rgba(197, 165, 90, 0.35)";
      ctx.beginPath();
      ctx.moveTo(dx, dy - 3);
      ctx.lineTo(dx + 2, dy);
      ctx.lineTo(dx, dy + 3);
      ctx.lineTo(dx - 2, dy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
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
