import { UIComponent } from "./core/UIComponent";
import type { Item } from "../state/itemModel";
import { RARITY_COLORS, sortItems } from "../state/itemModel";

/**
 * WoW-style inventory bag panel — right side of screen.
 * Opens/closes with the I key. Pure DOM, no framework.
 * Square icon slots with rarity-colored borders, stack badges, and rich
 * tooltips sourced from server-supplied item metadata.
 */
export class InventoryPanel extends UIComponent {
  /** Fired when the player uses a consumable (potion, scroll, etc.). */
  onUseItem: ((itemName: string) => void) | null = null;
  /** Fired when the player equips a weapon/shield/trinket. */
  onEquipItem: ((itemName: string) => void) | null = null;
  onClose: (() => void) | null = null;

  // Static so they're available inside render(), which runs in the
  // UIComponent super-constructor before instance fields initialize.
  private static readonly MAX_SLOTS = 24;
  private static readonly COLUMNS = 6;
  private static readonly SLOT_PX = 40;
  declare private grid: HTMLDivElement;
  declare private itemCountLabel: HTMLSpanElement;
  declare private goldLabel: HTMLSpanElement;
  declare private tooltip: HTMLDivElement;
  private currentInventory: Item[] = [];

  private static readonly EQUIP_RE =
    /sword|blade|axe|dagger|mace|hammer|spear|bow|staff|shield|armor|charm|amulet|rune|ring|trinket|cloak/i;

  constructor() {
    super('ui-root', 'inventory-panel');
  }

  render(): void {
    const width = InventoryPanel.COLUMNS * InventoryPanel.SLOT_PX + (InventoryPanel.COLUMNS - 1) * 6 + 24;
    Object.assign(this.container.style, {
      position: "absolute",
      top: "60px",
      right: "16px",
      width: `${width}px`,
      display: "none",
      flexDirection: "column",
      background: "rgba(8,6,18,0.94)",
      border: "1px solid rgba(197,165,90,0.4)",
      borderRadius: "8px",
      boxShadow:
        "0 0 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(197,165,90,0.25)",
      pointerEvents: "auto",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      color: "#e8dcc8",
      overflow: "hidden",
      zIndex: "20",
      userSelect: "none",
    } as CSSStyleDeclaration);

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      padding: "10px 16px",
      borderBottom: "1px solid rgba(197,165,90,0.3)",
    } as CSSStyleDeclaration);

    const title = document.createElement("span");
    Object.assign(title.style, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#c5a55a",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
      letterSpacing: "1px",
    } as CSSStyleDeclaration);
    title.textContent = "Inventory [I]";
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    Object.assign(closeBtn.style, {
      position: "absolute",
      right: "10px",
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "1px solid rgba(197,165,90,0.4)",
      borderRadius: "4px",
      color: "#c5a55a",
      fontSize: "14px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      cursor: "pointer",
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      lineHeight: "1",
    } as CSSStyleDeclaration);
    closeBtn.textContent = "X";
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "rgba(197,165,90,0.2)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "none";
    });
    closeBtn.addEventListener("click", () => {
      this.hide();
      this.onClose?.();
    });
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    this.grid = document.createElement("div");
    Object.assign(this.grid.style, {
      display: "grid",
      gridTemplateColumns: `repeat(${InventoryPanel.COLUMNS}, ${InventoryPanel.SLOT_PX}px)`,
      gap: "6px",
      padding: "12px",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.grid);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
      padding: "8px 14px",
      borderTop: "1px solid rgba(197,165,90,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: "12px",
      color: "#c5a55a",
    } as CSSStyleDeclaration);

    this.itemCountLabel = document.createElement("span");
    this.itemCountLabel.textContent = `0/${InventoryPanel.MAX_SLOTS} slots`;
    footer.appendChild(this.itemCountLabel);

    this.goldLabel = document.createElement("span");
    Object.assign(this.goldLabel.style, {
      fontWeight: "700",
      color: "#ffcc33",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    } as CSSStyleDeclaration);
    this.goldLabel.textContent = "🪙 0";
    footer.appendChild(this.goldLabel);
    this.container.appendChild(footer);

    this.tooltip = document.createElement("div");
    Object.assign(this.tooltip.style, {
      position: "fixed",
      display: "none",
      padding: "8px 12px",
      background: "rgba(10,6,2,0.96)",
      border: "1px solid #c5a55a",
      borderRadius: "4px",
      color: "#e8dcc8",
      fontSize: "12px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      pointerEvents: "none",
      zIndex: "30",
      maxWidth: "220px",
      textAlign: "left",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      lineHeight: "1.45",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.tooltip);

    this.renderSlots([]);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  override hide(): void {
    this.tooltip.style.display = "none";
    super.hide();
  }

  toggle(): void {
    if (this.getIsVisible()) {
      this.hide();
      this.onClose?.();
    } else {
      this.show();
    }
  }

  update(inventory: Item[], gold = 0): void {
    // Sort rarest-first so the grid reads consistently regardless of pickup order.
    this.currentInventory = sortItems(inventory);
    this.renderSlots(this.currentInventory);
    this.itemCountLabel.textContent = `${this.currentInventory.length}/${InventoryPanel.MAX_SLOTS} slots`;
    this.goldLabel.textContent = `🪙 ${gold}`;
  }

  // ── Internal rendering ──────────────────────────────────────────────────────

  private renderSlots(items: Item[]): void {
    this.grid.innerHTML = "";
    for (let i = 0; i < InventoryPanel.MAX_SLOTS; i++) {
      this.grid.appendChild(this.createSlot(items[i] ?? null));
    }
  }

  private createSlot(item: Item | null): HTMLDivElement {
    const slot = document.createElement("div");
    const rarityColor = item ? RARITY_COLORS[item.rarity] : "rgba(197,165,90,0.25)";
    Object.assign(slot.style, {
      width: `${InventoryPanel.SLOT_PX}px`,
      height: `${InventoryPanel.SLOT_PX}px`,
      background: item ? "rgba(30,22,12,0.85)" : "rgba(20,14,6,0.6)",
      border: `2px solid ${rarityColor}`,
      borderRadius: "4px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: item ? "pointer" : "default",
      position: "relative",
      overflow: "hidden",
      boxSizing: "border-box",
      transition: "box-shadow 0.15s, background 0.15s",
    } as CSSStyleDeclaration);

    if (!item) return slot;

    const icon = document.createElement("span");
    Object.assign(icon.style, {
      fontSize: "24px",
      lineHeight: "1",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    } as CSSStyleDeclaration);
    icon.textContent = item.icon;
    slot.appendChild(icon);

    if (item.quantity > 1) {
      const badge = document.createElement("span");
      Object.assign(badge.style, {
        position: "absolute",
        bottom: "1px",
        right: "3px",
        fontSize: "11px",
        fontWeight: "700",
        color: "#fff",
        textShadow: "0 1px 2px #000, 0 0 3px #000",
      } as CSSStyleDeclaration);
      badge.textContent = String(item.quantity);
      slot.appendChild(badge);
    }

    const isEquipment = InventoryPanel.EQUIP_RE.test(item.name);

    slot.addEventListener("mouseenter", () => {
      slot.style.boxShadow = `0 0 8px ${rarityColor}`;
      slot.style.background = "rgba(50,36,18,0.92)";
      this.showTooltip(slot, item, isEquipment);
    });
    slot.addEventListener("mouseleave", () => {
      slot.style.boxShadow = "";
      slot.style.background = "rgba(30,22,12,0.85)";
      this.tooltip.style.display = "none";
    });
    slot.addEventListener("click", () => {
      this.tooltip.style.display = "none";
      if (isEquipment) {
        this.flashSlot(slot, "#ffd700");
        this.onEquipItem?.(item.name);
      } else {
        this.flashSlot(slot, "#44ff88");
        this.onUseItem?.(item.name);
      }
    });

    return slot;
  }

  private showTooltip(slot: HTMLDivElement, item: Item, isEquipment: boolean): void {
    const rarityColor = RARITY_COLORS[item.rarity];
    const action = isEquipment ? "Click to equip" : "Click to use";
    const effectsHtml = InventoryPanel.formatEffects(item.effects);
    const valueHtml =
      item.value > 0
        ? `<br><span style="color:#ffcc33;font-size:10px">🪙 Sells for ${item.value} gold</span>`
        : "";
    this.tooltip.innerHTML =
      `<strong style="color:${rarityColor};font-size:13px">${item.name}</strong>` +
      `<br><span style="color:${rarityColor};font-size:10px;text-transform:capitalize">${item.rarity}</span>` +
      `<br><span style="color:#cbb890;font-size:11px">${item.description}</span>` +
      effectsHtml +
      valueHtml +
      `<br><span style="color:#8a7a55;font-size:10px;font-style:italic">${action}</span>`;
    this.tooltip.style.display = "block";
    const rect = slot.getBoundingClientRect();
    this.tooltip.style.left = `${rect.left}px`;
    this.tooltip.style.top = `${rect.top - 8}px`;
    this.tooltip.style.transform = "translate(-100%, -100%)";
  }

  /** Human-readable effect lines (e.g. "+30 HP") for the tooltip, or "". */
  private static readonly EFFECT_LABELS: Record<string, (n: number) => string> = {
    heal_hp: (n) => `+${n} HP`,
    restore_mana: (n) => `+${n} Mana`,
    max_hp: (n) => `+${n} Max HP`,
    level: (n) => `+${n} Level`,
  };

  private static formatEffects(effects: Record<string, number>): string {
    const lines = Object.entries(effects)
      .filter(([, value]) => value)
      .map(([key, value]) => InventoryPanel.EFFECT_LABELS[key]?.(value) ?? `${key}: ${value}`);
    if (lines.length === 0) return "";
    return `<br><span style="color:#6ad06a;font-size:11px">${lines.join(", ")}</span>`;
  }

  private flashSlot(slot: HTMLDivElement, color: string): void {
    slot.style.boxShadow = `0 0 10px ${color}`;
    setTimeout(() => {
      slot.style.boxShadow = "";
    }, 350);
  }

  get element(): HTMLElement {
    return this.container;
  }

  protected override onDispose(): void {
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
  }
}
