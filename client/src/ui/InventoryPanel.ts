import { UIComponent } from "./core/UIComponent";

/**
 * WoW-style inventory bag panel — right side of screen.
 * Opens/closes with the I key. Pure DOM, no framework.
 * Extends UIComponent for consistent lifecycle management.
 */
export class InventoryPanel extends UIComponent {
  /** Fired when the player uses a consumable (potion, scroll, etc.). */
  onUseItem: ((itemName: string) => void) | null = null;
  /** Fired when the player equips a weapon/shield/trinket. */
  onEquipItem: ((itemName: string) => void) | null = null;
  onClose: (() => void) | null = null;

  private readonly MAX_SLOTS = 20;
  private readonly COLUMNS = 4;
  declare private grid: HTMLDivElement;
  declare private itemCountLabel: HTMLSpanElement;
  declare private tooltip: HTMLDivElement;
  private currentInventory: string[] = [];

  constructor() {
    super('ui-root', 'inventory-panel');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      top: "60px",
      right: "16px",
      width: "260px",
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
      gridTemplateColumns: `repeat(${this.COLUMNS}, 1fr)`,
      gap: "6px",
      padding: "12px",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.grid);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
      padding: "8px 14px",
      borderTop: "1px solid rgba(197,165,90,0.3)",
      textAlign: "center",
      fontSize: "12px",
      color: "#c5a55a",
    } as CSSStyleDeclaration);

    this.itemCountLabel = document.createElement("span");
    this.itemCountLabel.textContent = `0/${this.MAX_SLOTS} items`;
    footer.appendChild(this.itemCountLabel);
    this.container.appendChild(footer);

    this.tooltip = document.createElement("div");
    Object.assign(this.tooltip.style, {
      position: "fixed",
      display: "none",
      padding: "6px 10px",
      background: "rgba(10,6,2,0.95)",
      border: "1px solid #c5a55a",
      borderRadius: "4px",
      color: "#e8dcc8",
      fontSize: "12px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      pointerEvents: "none",
      zIndex: "30",
      maxWidth: "180px",
      textAlign: "center",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      lineHeight: "1.4",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.tooltip);

    this.renderSlots([]);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  override show(): void {
    super.show();
  }

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


  update(inventory: string[]): void {
    this.currentInventory = [...inventory];
    this.renderSlots(this.currentInventory);
    this.itemCountLabel.textContent = `${this.currentInventory.length}/${this.MAX_SLOTS} items`;
  }

  // ── Internal rendering ──────────────────────────────────────────────────────

  private renderSlots(items: string[]): void {
    this.grid.innerHTML = "";

    for (let i = 0; i < this.MAX_SLOTS; i++) {
      const itemName = items[i] ?? null;
      const slot = this.createSlot(itemName);
      this.grid.appendChild(slot);
    }
  }

  private createSlot(itemName: string | null): HTMLDivElement {
    const slot = document.createElement("div");
    Object.assign(slot.style, {
      width: "100%",
      aspectRatio: "1",
      background: itemName
        ? "rgba(40,28,14,0.8)"
        : "rgba(20,14,6,0.6)",
      border: itemName
        ? "1px solid #c5a55a"
        : "1px solid rgba(197,165,90,0.25)",
      borderRadius: "4px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor: itemName ? "pointer" : "default",
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.15s, background 0.15s",
    } as CSSStyleDeclaration);

    if (!itemName) return slot;

    const label = document.createElement("span");
    Object.assign(label.style, {
      fontSize: "11px",
      color: "#e8dcc8",
      textAlign: "center",
      padding: "2px 4px",
      lineHeight: "1.25",
      wordBreak: "break-word",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      letterSpacing: "0.02em",
    } as CSSStyleDeclaration);
    label.textContent = itemName;
    slot.appendChild(label);

    const useBtn = document.createElement("button");
    Object.assign(useBtn.style, {
      position: "absolute",
      bottom: "2px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "none",
      padding: "1px 8px",
      fontSize: "9px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontWeight: "700",
      color: "#1a1108",
      background: "linear-gradient(180deg, #d4b96a 0%, #a8893a 100%)",
      border: "1px solid #c5a55a",
      borderRadius: "3px",
      cursor: "pointer",
      whiteSpace: "nowrap",
      zIndex: "2",
    } as CSSStyleDeclaration);

    const lower = itemName.toLowerCase();
    const isEquipment = /sword|blade|axe|dagger|mace|hammer|spear|bow|staff|shield|armor|charm|amulet|rune|ring|trinket|cloak/i.test(lower);

    if (isEquipment) {
      useBtn.textContent = "Equip";
    } else if (/scroll/i.test(lower)) {
      useBtn.textContent = "Read";
    } else {
      useBtn.textContent = "Use";
    }

    useBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.tooltip.style.display = "none";
      if (isEquipment) {
        this.flashSlot(slot, "#ffd700");
        this.onEquipItem?.(itemName);
      } else {
        this.flashSlot(slot, "#44ff88");
        this.onUseItem?.(itemName);
      }
    });
    slot.appendChild(useBtn);

    const description = this.getItemDescription(lower);

    slot.addEventListener("mouseenter", () => {
      slot.style.borderColor = "#e8cc6a";
      slot.style.background = "rgba(60,42,20,0.9)";
      this.tooltip.innerHTML = `<strong style="color:#c5a55a">${itemName}</strong><br><span style="color:#aaa;font-size:11px">${description}</span>`;
      this.tooltip.style.display = "block";
      const rect = slot.getBoundingClientRect();
      this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
      this.tooltip.style.top = `${rect.top - 8}px`;
      this.tooltip.style.transform = "translate(-50%, -100%)";
      useBtn.style.display = "block";
    });

    slot.addEventListener("mouseleave", () => {
      slot.style.borderColor = "#c5a55a";
      slot.style.background = "rgba(40,28,14,0.8)";
      this.tooltip.style.display = "none";
      useBtn.style.display = "none";
    });

    return slot;
  }

  private flashSlot(slot: HTMLDivElement, color: string): void {
    const original = slot.style.borderColor;
    slot.style.borderColor = color;
    slot.style.boxShadow = `0 0 8px ${color}`;
    setTimeout(() => {
      slot.style.borderColor = original;
      slot.style.boxShadow = "";
    }, 350);
  }

  private getItemDescription(lower: string): string {
    if (/health|heal|potion/i.test(lower)) return "Restores HP";
    if (/mana|elixir/i.test(lower)) return "Restores Mana";
    if (/sword|blade|axe|dagger|mace|hammer|spear|bow|staff/i.test(lower)) return "Equip as weapon";
    if (/shield|armor/i.test(lower)) return "Equip as shield";
    if (/charm|amulet|rune|ring|trinket/i.test(lower)) return "Equip as trinket";
    if (/scroll/i.test(lower)) return "Consumable magic item";
    return "Use item";
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
