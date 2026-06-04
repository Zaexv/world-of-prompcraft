import { UIComponent } from "./core/UIComponent";
import type { PlayerState } from "../state/PlayerState";

/**
 * HP / Mana / Level / Inventory status bars — WoW-style, fixed top-left.
 * Extends UIComponent for consistent lifecycle management.
 */
export class StatusBars extends UIComponent {
  declare private hpFill: HTMLDivElement;
  declare private hpText: HTMLSpanElement;
  declare private manaFill: HTMLDivElement;
  declare private manaText: HTMLSpanElement;
  declare private inventoryCount: HTMLSpanElement;
  declare private weaponSlot: HTMLSpanElement;
  declare private shieldSlot: HTMLSpanElement;
  declare private trinketSlot: HTMLSpanElement;

  constructor() {
    super('ui-root', 'status-bars');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      top: "16px",
      left: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      padding: "8px 10px",
      background: "rgba(8,6,18,0.75)",
      border: "1px solid rgba(197,165,90,0.2)",
      borderRadius: "6px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
      pointerEvents: "auto",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      userSelect: "none",
    } as CSSStyleDeclaration);

    // ── HP + Mana bars ────────────────────────────────────────────────────
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

    this.container.appendChild(barsCol);

    // ── Inventory count ──────────────────────────────────────────────────
    const invRow = document.createElement("div");
    Object.assign(invRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
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

    this.container.appendChild(invRow);

    // ── Equipment slots row ─────────────────────────────────────────────
    const equipRow = document.createElement("div");
    Object.assign(equipRow.style, {
      display: "flex",
      gap: "4px",
      flexWrap: "wrap",
    } as CSSStyleDeclaration);

    this.weaponSlot = this.createEquipSlot("\u2694\uFE0F", "Weapon");
    this.shieldSlot = this.createEquipSlot("\uD83D\uDEE1\uFE0F", "Shield");
    this.trinketSlot = this.createEquipSlot("\uD83D\uDC8D", "Trinket");

    equipRow.appendChild(this.weaponSlot);
    equipRow.appendChild(this.shieldSlot);
    equipRow.appendChild(this.trinketSlot);
    this.container.appendChild(equipRow);
  }

  update(state: PlayerState): void {
    // HP (clamped 0-100%, color shifts green→yellow→red)
    const hpPct = state.maxHp > 0 ? Math.min(100, Math.max(0, (state.hp / state.maxHp) * 100)) : 0;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpFill.style.background = hpPct > 50
      ? 'linear-gradient(90deg, #1a7a1a 0%, #33cc33 100%)'
      : hpPct > 25
        ? 'linear-gradient(90deg, #7a5a00 0%, #ccaa00 100%)'
        : 'linear-gradient(90deg, #8b0000 0%, #cc2222 100%)';
    this.hpText.textContent = `${state.hp} / ${state.maxHp}`;

    // Mana (clamped to 0-100%)
    const manaPct = state.maxMana > 0 ? Math.min(100, Math.max(0, (state.mana / state.maxMana) * 100)) : 0;
    this.manaFill.style.width = `${manaPct}%`;
    this.manaText.textContent = `${state.mana} / ${state.maxMana}`;

    // Inventory
    const count = state.inventory.reduce((sum, i) => sum + i.quantity, 0);
    this.inventoryCount.textContent = `${count} item${count !== 1 ? "s" : ""}`;

    // Equipment slots
    this.updateEquipSlot(this.weaponSlot, "\u2694\uFE0F", state.equipped.weapon);
    this.updateEquipSlot(this.shieldSlot, "\uD83D\uDEE1\uFE0F", state.equipped.shield);
    this.updateEquipSlot(this.trinketSlot, "\uD83D\uDC8D", state.equipped.trinket);
  }

  get element(): HTMLElement {
    return this.container;
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
