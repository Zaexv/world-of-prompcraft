/**
 * WoW-style zone name popup displayed when the player crosses zone boundaries.
 *
 * Visual: centered at top 25% of screen, gold zone name with tildes,
 * italic description below. Fades in 0.5s, holds 3s, fades out 1s.
 */
export class ZoneDisplay {
  readonly element: HTMLDivElement;

  private nameEl: HTMLDivElement;
  private descEl: HTMLDivElement;
  private fadeOutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "fixed",
      top: "25%",
      left: "50%",
      transform: "translateX(-50%)",
      textAlign: "center",
      pointerEvents: "none",
      zIndex: "80",
      opacity: "0",
      transition: "opacity 0.5s ease",
      padding: "16px 40px",
      background: "linear-gradient(180deg, rgba(10,6,2,0.7), rgba(10,6,2,0.3), transparent)",
      borderRadius: "4px",
    } as CSSStyleDeclaration);

    // Zone name
    this.nameEl = document.createElement("div");
    Object.assign(this.nameEl.style, {
      fontSize: "32px",
      color: "#c5a55a",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontWeight: "700",
      letterSpacing: "3px",
      textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(197,165,90,0.3)",
      marginBottom: "8px",
    } as CSSStyleDeclaration);
    this.element.appendChild(this.nameEl);

    // Description
    this.descEl = document.createElement("div");
    Object.assign(this.descEl.style, {
      fontSize: "14px",
      color: "#aaa",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontStyle: "italic",
      textShadow: "0 1px 4px rgba(0,0,0,0.8)",
      maxWidth: "400px",
      margin: "0 auto",
      lineHeight: "1.4",
    } as CSSStyleDeclaration);
    this.element.appendChild(this.descEl);
  }

  /**
   * Show a zone transition banner. Auto-fades after ~4 seconds total.
   * Cancels any previous animation if still in progress.
   */
  show(zoneName: string, description: string): void {
    // Cancel previous animation
    if (this.fadeOutTimer !== null) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }

    this.nameEl.textContent = `~ ${zoneName} ~`;
    this.descEl.textContent = description;

    // Reset opacity immediately then fade in on next frame
    this.element.style.transition = "none";
    this.element.style.opacity = "0";

    requestAnimationFrame(() => {
      // Fade in over 0.5s
      this.element.style.transition = "opacity 0.5s ease";
      this.element.style.opacity = "1";

      // Hold 3s then fade out over 1s
      this.fadeOutTimer = setTimeout(() => {
        this.element.style.transition = "opacity 1s ease";
        this.element.style.opacity = "0";
        this.fadeOutTimer = null;
      }, 3500); // 0.5s fade-in + 3s hold
    });
  }
}
