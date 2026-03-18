/**
 * Combat HUD overlay — WoW-style unit frames with player/NPC health bars,
 * mana bar, and a scrolling combat log.
 */
export class CombatHUD {
  readonly element: HTMLDivElement;

  private playerFrame: HTMLDivElement;
  private npcFrame: HTMLDivElement;
  private combatLog: HTMLDivElement;

  private playerPortrait: HTMLDivElement;
  private playerNameEl: HTMLDivElement;
  private playerHpFill: HTMLDivElement;
  private playerHpText: HTMLSpanElement;
  private playerManaFill: HTMLDivElement;
  private playerManaText: HTMLSpanElement;

  private npcPortrait: HTMLDivElement;
  private npcNameEl: HTMLDivElement;
  private npcHpFill: HTMLDivElement;
  private npcHpText: HTMLSpanElement;

  private logEntries: HTMLDivElement;
  private _isVisible = false;
  private currentNpcId = "";

  private styleTag: HTMLStyleElement;

  constructor() {
    // Inject keyframes + scrollbar styles
    this.styleTag = document.createElement("style");
    this.styleTag.textContent = `
      @keyframes combat-hud-flash {
        0% { filter: brightness(2.5); }
        100% { filter: brightness(1); }
      }
      .combat-hp-flash {
        animation: combat-hud-flash 0.25s ease-out;
      }
      #combat-log-entries::-webkit-scrollbar { width: 4px; }
      #combat-log-entries::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 2px; }
      #combat-log-entries::-webkit-scrollbar-thumb { background: #c5a55a; border-radius: 2px; }
    `;
    document.head.appendChild(this.styleTag);

    // ── Root container ──────────────────────────────────────────────────────
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "absolute",
      top: "80px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
      pointerEvents: "none",
      zIndex: "20",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      userSelect: "none",
    } as CSSStyleDeclaration);

    // ── Frames row (player left, NPC right) ─────────────────────────────────
    const framesRow = document.createElement("div");
    Object.assign(framesRow.style, {
      display: "flex",
      gap: "40px",
      alignItems: "flex-start",
    } as CSSStyleDeclaration);

    // Player frame
    const playerResult = this.createUnitFrame("Player", "P", true);
    this.playerFrame = playerResult.frame;
    this.playerPortrait = playerResult.portrait;
    this.playerNameEl = playerResult.nameEl;
    this.playerHpFill = playerResult.hpFill;
    this.playerHpText = playerResult.hpText;
    this.playerManaFill = playerResult.manaFill!;
    this.playerManaText = playerResult.manaText!;
    framesRow.appendChild(this.playerFrame);

    // NPC frame
    const npcResult = this.createUnitFrame("NPC", "N", false);
    this.npcFrame = npcResult.frame;
    this.npcPortrait = npcResult.portrait;
    this.npcNameEl = npcResult.nameEl;
    this.npcHpFill = npcResult.hpFill;
    this.npcHpText = npcResult.hpText;
    framesRow.appendChild(this.npcFrame);

    this.element.appendChild(framesRow);

    // ── Combat log ──────────────────────────────────────────────────────────
    this.combatLog = document.createElement("div");
    Object.assign(this.combatLog.style, {
      width: "440px",
      background: "linear-gradient(180deg, rgba(26,17,8,0.88) 0%, rgba(16,10,4,0.92) 100%)",
      border: "1px solid rgba(197,165,90,0.5)",
      borderRadius: "6px",
      padding: "8px 10px",
      boxShadow: "0 0 12px rgba(0,0,0,0.5)",
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

    this.element.appendChild(this.combatLog);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show(npcId: string, npcName: string, npcHp: number, npcMaxHp: number): void {
    this.currentNpcId = npcId;
    this._isVisible = true;

    // Update NPC frame
    this.npcNameEl.textContent = npcName;
    this.npcPortrait.textContent = npcName.charAt(0).toUpperCase();
    this.updateNpcHP(npcHp, npcMaxHp);

    // Reset player info label
    this.playerNameEl.textContent = "Player";
    this.playerPortrait.textContent = "P";

    // Clear old log entries
    this.logEntries.innerHTML = "";

    this.element.style.display = "flex";
  }

  hide(): void {
    this._isVisible = false;
    this.currentNpcId = "";
    this.element.style.display = "none";
  }

  updatePlayerHP(hp: number, maxHp: number): void {
    const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
    this.playerHpFill.style.width = `${pct}%`;
    this.playerHpFill.style.background = this.hpGradient(pct);
    this.playerHpText.textContent = `HP: ${hp}/${maxHp}`;
    this.triggerFlash(this.playerHpFill);
  }

  updatePlayerMana(mana: number, maxMana: number): void {
    const pct = maxMana > 0 ? (mana / maxMana) * 100 : 0;
    this.playerManaFill.style.width = `${pct}%`;
    this.playerManaText.textContent = `MP: ${mana}/${maxMana}`;
  }

  updateNpcHP(hp: number, maxHp: number): void {
    const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
    this.npcHpFill.style.width = `${pct}%`;
    this.npcHpFill.style.background = this.hpGradient(pct);
    this.npcHpText.textContent = `HP: ${hp}/${maxHp}`;
    this.triggerFlash(this.npcHpFill);
  }

  addLogEntry(text: string, color = "#e8dcc8"): void {
    const entry = document.createElement("div");
    Object.assign(entry.style, {
      fontSize: "11px",
      fontFamily: "'Courier New', monospace",
      color,
      lineHeight: "1.3",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    } as CSSStyleDeclaration);
    entry.textContent = `> ${text}`;
    this.logEntries.appendChild(entry);

    // Keep max 30 entries
    while (this.logEntries.children.length > 30) {
      this.logEntries.removeChild(this.logEntries.firstChild!);
    }

    // Auto-scroll
    this.logEntries.scrollTop = this.logEntries.scrollHeight;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get npcId(): string {
    return this.currentNpcId;
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
    // Force reflow to restart animation
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

    // Portrait circle
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

    // Info column
    const infoCol = document.createElement("div");
    Object.assign(infoCol.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      flex: "1",
    } as CSSStyleDeclaration);

    // Name
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

    // HP bar
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
}
