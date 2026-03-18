import * as THREE from "three";

/**
 * Screen-space floating damage / healing numbers.
 * Uses CSS animations for smooth movement — auto-removed from DOM on completion.
 */
export class DamagePopup {
  private container: HTMLElement;
  private styleInjected = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.injectStyles();
  }

  /**
   * Spawn a floating number at the given screen position.
   * @param screenX  X coordinate in pixels from left
   * @param screenY  Y coordinate in pixels from top
   * @param text     Text to display (e.g. "-17", "+30")
   * @param color    CSS colour string
   * @param isCrit   If true, larger bounce + gold + "!" suffix
   */
  spawn(
    screenX: number,
    screenY: number,
    text: string,
    color: string,
    isCrit = false,
  ): void {
    const el = document.createElement("div");

    // Random horizontal offset +-30px
    const offsetX = (Math.random() - 0.5) * 60;
    const startX = screenX + offsetX;

    const fontSize = isCrit ? 28 : 20;
    const displayText = isCrit ? `${text}!` : text;
    const displayColor = isCrit ? "#ffd700" : color;
    const animName = isCrit ? "dmg-popup-crit" : "dmg-popup-normal";

    Object.assign(el.style, {
      position: "absolute",
      left: `${startX}px`,
      top: `${screenY}px`,
      color: displayColor,
      fontSize: `${fontSize}px`,
      fontWeight: "900",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      textShadow: `0 2px 4px rgba(0,0,0,0.9), 0 0 8px ${displayColor}44`,
      pointerEvents: "none",
      zIndex: "50",
      whiteSpace: "nowrap",
      animation: `${animName} 1.5s ease-out forwards`,
      willChange: "transform, opacity",
    } as CSSStyleDeclaration);

    el.textContent = displayText;
    this.container.appendChild(el);

    // Remove from DOM after animation completes
    el.addEventListener("animationend", () => {
      el.remove();
    });

    // Fallback removal in case animationend doesn't fire
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 1800);
  }

  /**
   * Project a 3D world position to 2D screen coordinates.
   * Returns null if the position is behind the camera.
   */
  static worldToScreen(
    position: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ): { x: number; y: number } | null {
    const projected = position.clone().project(camera);

    // Behind camera check
    if (projected.z > 1) return null;

    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;

    return { x, y };
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (this.styleInjected) return;
    this.styleInjected = true;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes dmg-popup-normal {
        0% {
          transform: translateY(0) scale(1.2);
          opacity: 1;
        }
        30% {
          transform: translateY(-30px) scale(1);
          opacity: 1;
        }
        70% {
          transform: translateY(-70px) scale(0.95);
          opacity: 1;
        }
        100% {
          transform: translateY(-100px) scale(0.9);
          opacity: 0;
        }
      }

      @keyframes dmg-popup-crit {
        0% {
          transform: translateY(0) scale(0.5);
          opacity: 1;
        }
        10% {
          transform: translateY(-10px) scale(1.6);
          opacity: 1;
        }
        25% {
          transform: translateY(-25px) scale(1.2);
          opacity: 1;
        }
        70% {
          transform: translateY(-80px) scale(1.1);
          opacity: 1;
        }
        100% {
          transform: translateY(-120px) scale(1);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
