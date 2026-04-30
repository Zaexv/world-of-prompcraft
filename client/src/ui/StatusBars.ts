import type { PlayerState } from "../state/PlayerState";

/**
 * HP / Mana / Level / Inventory status bars — WoW-style, fixed top-left.
 */
export class StatusBars {
  readonly element: HTMLDivElement;

  private hpFill: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private manaFill: HTMLDivElement;
  private manaText: HTMLSpanElement;
  private levelBadge: HTMLDivElement;
  private inventoryCount: HTMLSpanElement;
  private weaponSlot: HTMLSpanElement;
  private shieldSlot: HTMLSpanElement;
  private trinketSlot: HTMLSpanElement;

  constructor() {
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "absolute",
      top: "16px",
      left: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      pointerEvents: "auto",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      userSelect: "none",
    } as CSSStyleDeclaration);

    // ── Level badge + bars row ────────────────────────────────────────────
    const topRow = document.createElement("div");
    Object.assign(topRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    } as CSSStyleDeclaration);

    // Level badge
    this.levelBadge = document.createElement("div");
    Object.assign(this.levelBadge.style, {
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
      fontSize: "15px",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      boxShadow: "0 0 6px rgba(197,165,90,0.4)",
      flexShrink: "0",
    } as CSSStyleDeclaration);
    this.levelBadge.textContent = "1";
    topRow.appendChild(this.levelBadge);

    // Bars column
    const barsCol = document.createElement("div");
    Object.assign(barsCol.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    } as CSSStyleDeclaration);

    // HP bar
    const { bar: hpBar, fill: hpFill, text: hpText } = this.createBar(
      "linear-gradient(90deg, #8b0000 0%, #cc2222 100%)",
      "rgba(60,10,10,0.85)",
    );
    this.hpFill = hpFill;
    this.hpText = hpText;
    barsCol.appendChild(hpBar);

    // Mana bar
    const { bar: manaBar, fill: manaFill, text: manaText } = this.createBar(
      "linear-gradient(90deg, #1a3a7a 0%, #3366cc 100%)",
      "rgba(10,20,50,0.85)",
    );
    this.manaFill = manaFill;
    this.manaText = manaText;
    barsCol.appendChild(manaBar);

    topRow.appendChild(barsCol);
    this.element.appendChild(topRow);

    // ── Inventory count ──────────────────────────────────────────────────
    const invRow = document.createElement("div");
    Object.assign(invRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      paddingLeft: "46px", // align with bars
      color: "#c5a55a",
      fontSize: "12px",
    } as CSSStyleDeclaration);

    // Simple unicode bag icon
    const bagIcon = document.createElement("span");
    bagIcon.textContent = "\uD83C\uDF92"; // backpack emoji, small
    bagIcon.style.fontSize = "14px";
    invRow.appendChild(bagIcon);

    this.inventoryCount = document.createElement("span");
    this.inventoryCount.textContent = "0 items";
    invRow.appendChild(this.inventoryCount);

    this.element.appendChild(invRow);

    // ── Equipment slots row ─────────────────────────────────────────────
    const equipRow = document.createElement("div");
    Object.assign(equipRow.style, {
      display: "flex",
      gap: "4px",
      paddingLeft: "46px",
      flexWrap: "wrap",
    } as CSSStyleDeclaration);

    this.weaponSlot = this.createEquipSlot("\u2694\uFE0F", "Weapon"); // sword emoji
    this.shieldSlot = this.createEquipSlot("\uD83D\uDEE1\uFE0F", "Shield");
    this.trinketSlot = this.createEquipSlot("\uD83D\uDC8D", "Trinket"); // ring emoji

    equipRow.appendChild(this.weaponSlot);
    equipRow.appendChild(this.shieldSlot);
    equipRow.appendChild(this.trinketSlot);
    this.element.appendChild(equipRow);
  }

  update(state: PlayerState): void {
    // HP (clamped to 0-100%)
    const hpPct = state.maxHp > 0 ? Math.min(100, Math.max(0, (state.hp / state.maxHp) * 100)) : 0;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpText.textContent = `${state.hp} / ${state.maxHp}`;

    // Mana (clamped to 0-100%)
    const manaPct = state.maxMana > 0 ? Math.min(100, Math.max(0, (state.mana / state.maxMana) * 100)) : 0;
    this.manaFill.style.width = `${manaPct}%`;
    this.manaText.textContent = `${state.mana} / ${state.maxMana}`;

    // Level
    this.levelBadge.textContent = String(state.level);

    // Inventory
    const count = state.inventory.length;
    this.inventoryCount.textContent = `${count} item${count !== 1 ? "s" : ""}`;

    // Equipment slots
    this.updateEquipSlot(this.weaponSlot, "\u2694\uFE0F", state.equipped.weapon);
    this.updateEquipSlot(this.shieldSlot, "\uD83D\uDEE1\uFE0F", state.equipped.shield);
    this.updateEquipSlot(this.trinketSlot, "\uD83D\uDC8D", state.equipped.trinket);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private createBar(
    fillGradient: string,
    trackBg: string,
  ): { bar: HTMLDivElement; fill: HTMLDivElement; text: HTMLSpanElement } {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      position: "relative",
      width: "180px",
      height: "18px",
      background: trackBg,
      border: "1px solid #c5a55a",
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
      fontSize: "11px",
      fontWeight: "700",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,0.9)",
      zIndex: "1",
    } as CSSStyleDeclaration);
    bar.appendChild(text);

    return { bar, fill, text };
  }

  private createEquipSlot(icon: string, label: string): HTMLSpanElement {
    const el = document.createElement("span");
    Object.assign(el.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "3px",
      padding: "2px 6px",
      fontSize: "10px",
      color: "#777",
      background: "rgba(20,14,6,0.7)",
      border: "1px solid rgba(197,165,90,0.2)",
      borderRadius: "3px",
    } as Partial<CSSStyleDeclaration>);
    el.textContent = `${icon} ${label}: --`;
    el.title = `${label}: empty`;
    return el;
  }

  private updateEquipSlot(el: HTMLSpanElement, icon: string, item: string | null): void {
    if (item) {
      el.textContent = `${icon} ${item}`;
      el.title = item;
      el.style.color = "#c5a55a";
      el.style.borderColor = "rgba(197,165,90,0.5)";
    } else {
      el.textContent = `${icon} --`;
      el.title = "Empty";
      el.style.color = "#777";
      el.style.borderColor = "rgba(197,165,90,0.2)";
    }
  }
}
