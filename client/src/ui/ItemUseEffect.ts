/**
 * Full-screen visual feedback when the player uses a consumable item.
 * Each effect is a short CSS animation overlay that auto-cleans up.
 */
export class ItemUseEffect {
  private container: HTMLElement;
  private styleInjected = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.injectStyles();
  }

  /**
   * Show a potion / buff use effect.
   * @param itemName  Name of the item (displayed as rising text)
   * @param effectType  Visual theme: 'heal' (green), 'mana' (blue), 'buff' (gold)
   */
  show(itemName: string, effectType: "heal" | "mana" | "buff"): void {
    const colors = {
      heal: { glow: "#33ff66", tint: "rgba(30,120,50,0.18)", border: "#44cc44", text: "+HP" },
      mana: { glow: "#4488ff", tint: "rgba(30,50,140,0.18)", border: "#4488ff", text: "+MP" },
      buff: { glow: "#ffd700", tint: "rgba(140,120,30,0.12)", border: "#c5a55a", text: "Buff!" },
    };

    const c = colors[effectType];

    // ── Border glow overlay ─────────────────────────────────────────────────
    const borderOverlay = document.createElement("div");
    Object.assign(borderOverlay.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "60",
      boxShadow: `inset 0 0 60px ${c.glow}55, inset 0 0 120px ${c.glow}22`,
      animation: "item-use-border 1.5s ease-out forwards",
      willChange: "opacity",
    } as CSSStyleDeclaration);
    this.container.appendChild(borderOverlay);

    // ── Tint overlay ────────────────────────────────────────────────────────
    const tintOverlay = document.createElement("div");
    Object.assign(tintOverlay.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "59",
      background: `radial-gradient(ellipse at center, ${c.tint} 0%, transparent 70%)`,
      animation: "item-use-tint 1.5s ease-out forwards",
      willChange: "opacity",
    } as CSSStyleDeclaration);
    this.container.appendChild(tintOverlay);

    // ── Rising text ─────────────────────────────────────────────────────────
    const textEl = document.createElement("div");
    Object.assign(textEl.style, {
      position: "absolute",
      left: "50%",
      top: "45%",
      transform: "translateX(-50%)",
      color: c.border,
      fontSize: "22px",
      fontWeight: "700",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      textShadow: `0 2px 8px rgba(0,0,0,0.8), 0 0 16px ${c.glow}66`,
      pointerEvents: "none",
      zIndex: "61",
      whiteSpace: "nowrap",
      animation: "item-use-text 1.5s ease-out forwards",
      willChange: "transform, opacity",
    } as CSSStyleDeclaration);
    textEl.textContent = itemName;
    this.container.appendChild(textEl);

    // ── Particle ring (pseudo particles via multiple small divs) ────────────
    const particleCount = 12;
    const particles: HTMLDivElement[] = [];
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement("div");
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 35 + Math.random() * 15;
      const startX = 50 + Math.cos(angle) * radius;
      const startY = 50 + Math.sin(angle) * radius;
      const size = 3 + Math.random() * 4;

      Object.assign(p.style, {
        position: "absolute",
        left: `${startX}%`,
        top: `${startY}%`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: c.glow,
        boxShadow: `0 0 6px ${c.glow}`,
        pointerEvents: "none",
        zIndex: "62",
        opacity: "0",
        animation: `item-use-particle 1.2s ease-out ${i * 0.05}s forwards`,
        willChange: "transform, opacity",
      } as CSSStyleDeclaration);

      this.container.appendChild(p);
      particles.push(p);
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────
    setTimeout(() => {
      borderOverlay.remove();
      tintOverlay.remove();
      textEl.remove();
      for (const p of particles) p.remove();
    }, 1700);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (this.styleInjected) return;
    this.styleInjected = true;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes item-use-border {
        0% { opacity: 0; }
        15% { opacity: 1; }
        60% { opacity: 0.7; }
        100% { opacity: 0; }
      }

      @keyframes item-use-tint {
        0% { opacity: 0; }
        20% { opacity: 1; }
        100% { opacity: 0; }
      }

      @keyframes item-use-text {
        0% {
          transform: translateX(-50%) translateY(0) scale(0.8);
          opacity: 0;
        }
        15% {
          transform: translateX(-50%) translateY(-10px) scale(1.1);
          opacity: 1;
        }
        60% {
          transform: translateX(-50%) translateY(-40px) scale(1);
          opacity: 1;
        }
        100% {
          transform: translateX(-50%) translateY(-80px) scale(0.9);
          opacity: 0;
        }
      }

      @keyframes item-use-particle {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        20% {
          transform: scale(1.5);
          opacity: 1;
        }
        100% {
          transform: scale(0) translateY(-40px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
