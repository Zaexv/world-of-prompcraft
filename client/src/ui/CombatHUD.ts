import { UIComponent } from "./core/UIComponent";

/**
 * Combat HUD overlay — WoW-style unit frames with player/NPC health bars,
 * mana bar, and a scrolling combat log.
 * Extends UIComponent for consistent lifecycle management.
 */
export class CombatHUD extends UIComponent {
  declare private playerFrame: HTMLDivElement;
  declare private npcFrame: HTMLDivElement;
  declare private combatLog: HTMLDivElement;

  declare private playerPortrait: HTMLDivElement;
  declare private playerNameEl: HTMLDivElement;
  declare private playerHpFill: HTMLDivElement;
  declare private playerHpText: HTMLSpanElement;
  declare private playerManaFill: HTMLDivElement;
  declare private playerManaText: HTMLSpanElement;

  declare private npcPortrait: HTMLDivElement;
  declare private npcNameEl: HTMLDivElement;
  declare private npcHpFill: HTMLDivElement;
  declare private npcHpText: HTMLSpanElement;

  declare private logEntries: HTMLDivElement;
  private currentNpcId = "";

  declare private styleTag: HTMLStyleElement;

  constructor() {
    super('ui-root', 'combat-hud');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    this.styleTag = document.createElement("style");
    this.styleTag.textContent = `
      @keyframes combat-hud-flash {
        0% { filter: brightness(2.5); }
        100% { filter: brightness(1); }
      }
      .combat-hp-flash {
        animation: combat-hud-flash 0.25s ease-out;
      }
    `;
    document.head.appendChild(this.styleTag);

    Object.assign(this.container.style, {
      position: "absolute",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      padding: "10px 16px",
      background: "rgba(8,6,18,0.82)",
      border: "1px solid rgba(197,165,90,0.25)",
      borderRadius: "8px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
      pointerEvents: "none",
      zIndex: "20",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      userSelect: "none",
    } as CSSStyleDeclaration);

    const framesRow = document.createElement("div");
    Object.assign(framesRow.style, {
      display: "flex",
      gap: "40px",
      alignItems: "flex-start",
    } as CSSStyleDeclaration);

    const playerResult = this.createUnitFrame("Player", "P", true);
    this.playerFrame = playerResult.frame;
    this.playerPortrait = playerResult.portrait;
    this.playerNameEl = playerResult.nameEl;
    this.playerHpFill = playerResult.hpFill;
    this.playerHpText = playerResult.hpText;
    this.playerManaFill = playerResult.manaFill!;
    this.playerManaText = playerResult.manaText!;
    framesRow.appendChild(this.playerFrame);

    const npcResult = this.createUnitFrame("NPC", "N", false);
    this.npcFrame = npcResult.frame;
    this.npcPortrait = npcResult.portrait;
    this.npcNameEl = npcResult.nameEl;
    this.npcHpFill = npcResult.hpFill;
    this.npcHpText = npcResult.hpText;
    framesRow.appendChild(this.npcFrame);

    this.container.appendChild(framesRow);

    this.combatLog = document.createElement("div");
    Object.assign(this.combatLog.style, {
      width: "380px",
      borderTop: "1px solid rgba(197,165,90,0.2)",
      paddingTop: "6px",
    } as CSSStyleDeclaration);

    const logHeader = document.createElement("div");
    Object.assign(logHeader.style, {
      fontSize: "11px",
      fontWeight: "700",
      color: "#c5a55a",
      marginBottom: "6px",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
    } as CSSStyleDeclaration);
    logHeader.textContent = "Combat Log";
    this.combatLog.appendChild(logHeader);

    this.logEntries = document.createElement("div");
    this.logEntries.id = "combat-log-entries";
    Object.assign(this.logEntries.style, {
      maxHeight: "80px",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "3px",
    } as CSSStyleDeclaration);
    this.combatLog.appendChild(this.logEntries);

    this.container.appendChild(this.combatLog);
  }

  // Call signatures for compatibility
  show(npcId: string, npcName: string, npcHp: number, npcMaxHp: number): void;
  show(): void;
  show(npcId?: string, npcName?: string, npcHp?: number, npcMaxHp?: number): void {
    if (npcId !== undefined && npcName !== undefined && npcHp !== undefined && npcMaxHp !== undefined) {
      this.currentNpcId = npcId;

      this.npcNameEl.textContent = npcName;
      this.npcPortrait.textContent = npcName.charAt(0).toUpperCase();
      this.updateNpcHP(npcHp, npcMaxHp);

      this.playerNameEl.textContent = "Player";
      this.playerPortrait.textContent = "P";

      this.logEntries.innerHTML = "";

      super.show();
    } else {
      super.show();
    }
  }

  hide(): void {
    this.currentNpcId = "";
    super.hide();
  }

  updatePlayerHP(hp: number, maxHp: number): void {
    const pct = maxHp > 0 ? Math.min(100, Math.max(0, (hp / maxHp) * 100)) : 0;
    this.playerHpFill.style.width = `${pct}%`;
    this.playerHpFill.style.background = this.hpGradient(pct);
    this.playerHpText.textContent = `HP: ${hp}/${maxHp}`;
    this.triggerFlash(this.playerHpFill);
  }

  updatePlayerMana(mana: number, maxMana: number): void {
    const pct = maxMana > 0 ? Math.min(100, Math.max(0, (mana / maxMana) * 100)) : 0;
    this.playerManaFill.style.width = `${pct}%`;
    this.playerManaText.textContent = `MP: ${mana}/${maxMana}`;
  }

  updateNpcHP(hp: number, maxHp: number): void {
    const pct = maxHp > 0 ? Math.min(100, Math.max(0, (hp / maxHp) * 100)) : 0;
    this.npcHpFill.style.width = `${pct}%`;
    this.npcHpFill.style.background = this.hpGradient(pct);
    this.npcHpText.textContent = `HP: ${hp}/${maxHp}`;
    this.triggerFlash(this.npcHpFill);
  }

  addLogEntry(text: string, color = "#e8dcc8"): void {
    const entry = document.createElement("div");
    const isBold = color === "#ffd700" || color === "#ff4400";
    Object.assign(entry.style, {
      fontSize: isBold ? "12px" : "11px",
      fontFamily: "'Courier New', monospace",
      color,
      fontWeight: isBold ? "900" : "400",
      lineHeight: "1.3",
      textShadow: isBold
        ? `0 1px 4px ${color}88, 0 1px 2px rgba(0,0,0,0.8)`
        : "0 1px 2px rgba(0,0,0,0.8)",
      letterSpacing: isBold ? "0.5px" : "0",
    } as CSSStyleDeclaration);
    entry.textContent = `> ${text}`;
    this.logEntries.appendChild(entry);

    while (this.logEntries.children.length > 30) {
      this.logEntries.removeChild(this.logEntries.firstChild!);
    }

    this.logEntries.scrollTop = this.logEntries.scrollHeight;
  }

  flashNpcPortrait(): void {
    this.triggerFlash(this.npcHpFill);
    const orig = this.npcPortrait.style.border;
    this.npcPortrait.style.border = "2px solid #ff4400";
    setTimeout(() => { this.npcPortrait.style.border = orig; }, 300);
  }

  /** Check if combat HUD is currently visible. */
  // @ts-expect-error - override protected property as public getter for backward compatibility
  get isVisible(): boolean {
    return this.getIsVisible();
  }

  get npcId(): string {
    return this.currentNpcId;
  }

  get element(): HTMLElement {
    return this.container;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private hpGradient(pct: number): string {
    if (pct > 50) {
      return "linear-gradient(90deg, #1a7a1a 0%, #33cc33 100%)";
    } else if (pct > 25) {
      return "linear-gradient(90deg, #b8860b 0%, #daa520 100%)";
    }
    return "linear-gradient(90deg, #8b0000 0%, #cc2222 100%)";
  }

  private triggerFlash(el: HTMLElement): void {
    el.classList.remove("combat-hp-flash");
    void el.offsetWidth;
    el.classList.add("combat-hp-flash");
  }

  private createUnitFrame(
    name: string,
    initial: string,
    withMana: boolean,
  ): {
    frame: HTMLDivElement;
    portrait: HTMLDivElement;
    nameEl: HTMLDivElement;
    hpFill: HTMLDivElement;
    hpText: HTMLSpanElement;
    manaFill?: HTMLDivElement;
    manaText?: HTMLSpanElement;
  } {
    const frame = document.createElement("div");
    Object.assign(frame.style, {
      display: "flex",
      gap: "8px",
      alignItems: "center",
      background: "linear-gradient(180deg, rgba(26,17,8,0.9) 0%, rgba(16,10,4,0.94) 100%)",
      border: "1px solid rgba(197,165,90,0.6)",
      borderRadius: "6px",
      padding: "8px 12px",
      boxShadow: "0 0 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(197,165,90,0.15)",
      minWidth: "200px",
    } as CSSStyleDeclaration);

    const portrait = document.createElement("div");
    Object.assign(portrait.style, {
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      border: "2px solid #c5a55a",
      background: "radial-gradient(circle, #2a1d0e 0%, #1a1108 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#c5a55a",
      fontWeight: "700",
      fontSize: "16px",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      flexShrink: "0",
    } as CSSStyleDeclaration);
    portrait.textContent = initial;
    frame.appendChild(portrait);

    const infoCol = document.createElement("div");
    Object.assign(infoCol.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      flex: "1",
    } as CSSStyleDeclaration);

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontSize: "12px",
      fontWeight: "700",
      color: "#c5a55a",
      letterSpacing: "0.5px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "140px",
    } as CSSStyleDeclaration);
    nameEl.textContent = name;
    infoCol.appendChild(nameEl);

    const { bar: hpBar, fill: hpFill, text: hpText } = this.createBar(
      "linear-gradient(90deg, #1a7a1a 0%, #33cc33 100%)",
      "rgba(10,30,10,0.85)",
    );
    hpText.textContent = "HP: 100/100";
    infoCol.appendChild(hpBar);

    let manaFill: HTMLDivElement | undefined;
    let manaText: HTMLSpanElement | undefined;

    if (withMana) {
      const manaResult = this.createBar(
        "linear-gradient(90deg, #1a3a7a 0%, #3366cc 100%)",
        "rgba(10,20,50,0.85)",
      );
      manaResult.text.textContent = "MP: 50/50";
      infoCol.appendChild(manaResult.bar);
      manaFill = manaResult.fill;
      manaText = manaResult.text;
    }

    frame.appendChild(infoCol);

    return { frame, portrait, nameEl, hpFill, hpText, manaFill, manaText };
  }

  private createBar(
    fillGradient: string,
    trackBg: string,
  ): { bar: HTMLDivElement; fill: HTMLDivElement; text: HTMLSpanElement } {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      position: "relative",
      width: "140px",
      height: "16px",
      background: trackBg,
      border: "1px solid rgba(197,165,90,0.4)",
      borderRadius: "3px",
      overflow: "hidden",
      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
    } as CSSStyleDeclaration);

    const fill = document.createElement("div");
    Object.assign(fill.style, {
      position: "absolute",
      top: "0",
      left: "0",
      height: "100%",
      width: "100%",
      background: fillGradient,
      transition: "width 0.3s ease",
    } as CSSStyleDeclaration);
    bar.appendChild(fill);

    const text = document.createElement("span");
    Object.assign(text.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "10px",
      fontWeight: "700",
      fontFamily: "'Courier New', monospace",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,0.9)",
      zIndex: "1",
    } as CSSStyleDeclaration);
    bar.appendChild(text);

    return { bar, fill, text };
  }

  protected override onDispose(): void {
    if (this.styleTag && this.styleTag.parentNode) {
      this.styleTag.parentNode.removeChild(this.styleTag);
    }
  }
}
