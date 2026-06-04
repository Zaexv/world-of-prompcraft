import { UIComponent } from "./core/UIComponent";

// ── Per-zone visual config ────────────────────────────────────────────────────

interface ZoneTheme {
  accent: string;
  category: string;
  glyph: string;
}

const ZONE_THEMES: Record<string, ZoneTheme> = {
  "Suarez Quarter":        { accent: "#cc88ff", category: "MAGE DISTRICT",        glyph: "—" },
  "Fort Malaka":          { accent: "#ffdd88", category: "MEDITERRANEAN CITY",   glyph: "—" },
  "Elders' Village":      { accent: "#88ffcc", category: "STARTING VILLAGE",     glyph: "—" },
  "Dark Forest":          { accent: "#55dd55", category: "FORBIDDEN FOREST",     glyph: "—" },
  "Ember Peaks":          { accent: "#ff7733", category: "VOLCANIC MOUNTAINS",   glyph: "—" },
  "Crystal Lake":         { accent: "#66ddff", category: "ENCHANTED WATERS",     glyph: "—" },
  "Blasted Suarezlands":  { accent: "#ff3300", category: "VOLCANIC WASTELAND",   glyph: "—" },
  "Crystal Tundra":       { accent: "#aaeeff", category: "FROZEN EXPANSE",       glyph: "—" },
  "Moin Swamps":          { accent: "#66bb44", category: "SWAMPLAND",            glyph: "—" },
  "Malaka Area":          { accent: "#eecc44", category: "ROLLING GRASSLANDS",   glyph: "—" },
  "Tanis Desert":         { accent: "#d4a855", category: "ARID WASTELAND",       glyph: "—" },
  "Teldrassil Wilds":     { accent: "#9966ff", category: "ANCIENT FOREST",       glyph: "—" },
};

const DEFAULT_THEME: ZoneTheme = {
  accent: "#c5a55a",
  category: "UNCHARTED LANDS",
  glyph: "~",
};

/**
 * WoW-style zone name popup displayed when the player crosses zone boundaries.
 * Extends UIComponent for consistent lifecycle management.
 *
 * Visual: centered at top 25% of screen.  Each zone has a unique accent color
 * and category tag.  Animation: slide-down + fade-in 0.5s, hold 3s, fade-out 1s.
 */
export class ZoneDisplay extends UIComponent {
  declare private categoryEl: HTMLDivElement;
  declare private nameEl: HTMLDivElement;
  declare private dividerEl: HTMLDivElement;
  declare private descEl: HTMLDivElement;
  private fadeOutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super('ui-root', 'zone-display');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      top: "20%",
      left: "50%",
      transform: "translateX(-50%) translateY(-12px)",
      textAlign: "center",
      pointerEvents: "none",
      zIndex: "80",
      opacity: "0",
      transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)",
      padding: "18px 52px 20px",
      background: [
        "radial-gradient(ellipse 80% 100% at 50% 0%,",
        "  rgba(10,4,20,0.85) 0%,",
        "  rgba(10,4,20,0.55) 55%,",
        "  transparent 100%)",
      ].join(""),
      minWidth: "320px",
    } as CSSStyleDeclaration);

    // Zone category tag
    this.categoryEl = document.createElement("div");
    Object.assign(this.categoryEl.style, {
      fontSize: "10px",
      color: "#998877",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontWeight: "600",
      letterSpacing: "4px",
      textTransform: "uppercase",
      marginBottom: "6px",
      textShadow: "0 1px 4px rgba(0,0,0,0.9)",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.categoryEl);

    // Zone name
    this.nameEl = document.createElement("div");
    Object.assign(this.nameEl.style, {
      fontSize: "34px",
      color: "#c5a55a",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontWeight: "700",
      letterSpacing: "3px",
      textShadow: "0 2px 12px rgba(0,0,0,0.95), 0 0 28px rgba(197,165,90,0.25)",
      marginBottom: "10px",
      lineHeight: "1.1",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.nameEl);

    // Decorative divider
    this.dividerEl = document.createElement("div");
    Object.assign(this.dividerEl.style, {
      width: "60%",
      height: "1px",
      background: "linear-gradient(90deg, transparent, rgba(197,165,90,0.6), transparent)",
      margin: "0 auto 10px",
      borderRadius: "1px",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.dividerEl);

    // Description
    this.descEl = document.createElement("div");
    Object.assign(this.descEl.style, {
      fontSize: "13px",
      color: "#998888",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontStyle: "italic",
      textShadow: "0 1px 4px rgba(0,0,0,0.8)",
      maxWidth: "420px",
      margin: "0 auto",
      lineHeight: "1.5",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.descEl);
  }

  protected override onDispose(): void {
    if (this.fadeOutTimer !== null) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }
  }

  // Overloaded show() method - base class show() and custom show(zoneName, description)
  show(): void;
  show(zoneName: string, description: string): void;
  show(zoneName?: string, description?: string): void {
    if (zoneName === undefined || description === undefined) {
      return;
    }

    // Cancel previous animation
    if (this.fadeOutTimer !== null) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }

    const theme = ZONE_THEMES[zoneName] ?? DEFAULT_THEME;
    const glyph = theme.glyph === "⟨⟩"
      ? `⟨ ${zoneName} ⟩`
      : `~ ${zoneName} ~`;

    // Update content
    this.categoryEl.textContent = theme.category;
    this.nameEl.textContent = glyph;
    this.descEl.textContent = description;

    // Per-zone accent color
    this.nameEl.style.color = theme.accent;
    this.nameEl.style.textShadow = [
      "0 2px 12px rgba(0,0,0,0.95)",
      `0 0 32px ${theme.accent}55`,
    ].join(", ");
    this.dividerEl.style.background = [
      `linear-gradient(90deg, transparent, ${theme.accent}88, transparent)`,
    ].join("");

    // Reset: hidden + shifted up
    this.container.style.transition = "none";
    this.container.style.opacity = "0";
    this.container.style.transform = "translateX(-50%) translateY(-16px)";

    requestAnimationFrame(() => {
      // Slide down + fade in
      this.container.style.transition = "opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)";
      this.container.style.opacity = "1";
      this.container.style.transform = "translateX(-50%) translateY(0px)";

      // Hold 3.5s then fade out
      this.fadeOutTimer = setTimeout(() => {
        this.container.style.transition = "opacity 1s ease, transform 1s ease";
        this.container.style.opacity = "0";
        this.container.style.transform = "translateX(-50%) translateY(8px)";
        this.fadeOutTimer = null;
      }, 4000);
    });
  }

  get element(): HTMLElement {
    return this.container;
  }
}
