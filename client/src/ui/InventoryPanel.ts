/**
 * WoW-style inventory bag panel — right side of screen.
 * Opens/closes with the I key. Pure DOM, no framework.
 */
export class InventoryPanel {
  readonly element: HTMLDivElement;

  /** Fired when the player uses a consumable (potion, scroll, etc.). */
  onUseItem: ((itemName: string) => void) | null = null;
  /** Fired when the player equips a weapon/shield/trinket. */
  onEquipItem: ((itemName: string) => void) | null = null;
  onClose: (() => void) | null = null;

  private readonly MAX_SLOTS = 20;
  private readonly COLUMNS = 4;
  private grid: HTMLDivElement;
  private itemCountLabel: HTMLSpanElement;
  private tooltip: HTMLDivElement;
  private currentInventory: string[] = [];

  constructor() {
    // ── Root container ──────────────────────────────────────────────────
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "absolute",
      top: "60px",
      right: "16px",
      width: "260px",
      display: "none",
      flexDirection: "column",
      background:
        "linear-gradient(180deg, rgba(26,17,8,0.94) 0%, rgba(20,12,4,0.97) 100%)",
      border: "2px solid #c5a55a",
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

    // ── Header ──────────────────────────────────────────────────────────
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
    title.textContent = "Inventory";
    header.appendChild(title);

    // Close button
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
    this.element.appendChild(header);

    // ── Grid ────────────────────────────────────────────────────────────
    this.grid = document.createElement("div");
    Object.assign(this.grid.style, {
      display: "grid",
      gridTemplateColumns: `repeat(${this.COLUMNS}, 1fr)`,
      gap: "6px",
      padding: "12px",
    } as CSSStyleDeclaration);
    this.element.appendChild(this.grid);

    // ── Footer (item count) ─────────────────────────────────────────────
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
    this.element.appendChild(footer);

    // ── Tooltip (shared, repositioned per slot) ─────────────────────────
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
      zIndex: "100",
      whiteSpace: "nowrap",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.tooltip);

    // Build the initial empty grid
    this.renderSlots([]);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show(): void {
    this.element.style.display = "flex";
  }

  hide(): void {
    this.element.style.display = "none";
    this.tooltip.style.display = "none";
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
      this.onClose?.();
    } else {
      this.show();
    }
  }

  get isVisible(): boolean {
    return this.element.style.display !== "none";
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

    // Item name label
    const label = document.createElement("span");
    Object.assign(label.style, {
      fontSize: "10px",
      color: "#e8dcc8",
      textAlign: "center",
      padding: "2px 4px",
      lineHeight: "1.2",
      wordBreak: "break-word",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    } as CSSStyleDeclaration);
    label.textContent = itemName;
    slot.appendChild(label);

    // "Use" button (visible on hover) — all items are usable
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
    // Context-sensitive label based on item type
    const lower = itemName.toLowerCase();
    if (/sword|blade|axe|dagger|mace|hammer|spear/i.test(lower)) {
      useBtn.textContent = "Equip";
    } else if (/scroll/i.test(lower)) {
      useBtn.textContent = "Read";
    } else if (/shield|armor/i.test(lower)) {
      useBtn.textContent = "Equip";
    } else {
      useBtn.textContent = "Use";
    }
    const isEquipment = /sword|blade|axe|dagger|mace|hammer|spear|bow|staff|shield|armor|charm|amulet|rune|ring|trinket|cloak/i.test(lower);
    useBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isEquipment) {
        this.onEquipItem?.(itemName);
      } else {
        this.onUseItem?.(itemName);
      }
    });
    slot.appendChild(useBtn);

    // Hover effects
    slot.addEventListener("mouseenter", (e) => {
      slot.style.borderColor = "#e8cc6a";
      slot.style.background = "rgba(60,42,20,0.9)";
      // Show tooltip
      this.tooltip.textContent = itemName;
      this.tooltip.style.display = "block";
      const rect = slot.getBoundingClientRect();
      this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
      this.tooltip.style.top = `${rect.top - 28}px`;
      this.tooltip.style.transform = "translateX(-50%)";
      // Show Use button
      if (useBtn) useBtn.style.display = "block";
    });

    slot.addEventListener("mouseleave", () => {
      slot.style.borderColor = "#c5a55a";
      slot.style.background = "rgba(40,28,14,0.8)";
      this.tooltip.style.display = "none";
      if (useBtn) useBtn.style.display = "none";
    });

    // Click shows tooltip (for touch or quick click)
    slot.addEventListener("click", () => {
      this.tooltip.textContent = itemName;
      this.tooltip.style.display = "block";
      const rect = slot.getBoundingClientRect();
      this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
      this.tooltip.style.top = `${rect.top - 28}px`;
      this.tooltip.style.transform = "translateX(-50%)";
    });

    return slot;
  }
}
