/**
 * Always-visible scrollable combat log panel at the bottom-left of the screen.
 * Shows combat events, loot, quests, and NPC actions with colored entries.
 */
export class CombatLog {
  readonly element: HTMLDivElement;

  private logEntries: HTMLDivElement;
  private styleTag: HTMLStyleElement;
  private readonly MAX_ENTRIES = 50;

  constructor() {
    // Inject scrollbar styles
    this.styleTag = document.createElement("style");
    this.styleTag.textContent = `
      #combat-log-global-entries::-webkit-scrollbar { width: 4px; }
      #combat-log-global-entries::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 2px; }
      #combat-log-global-entries::-webkit-scrollbar-thumb { background: rgba(197,165,90,0.6); border-radius: 2px; }
    `;
    document.head.appendChild(this.styleTag);

    // ── Root container ────────────────────────────────────────────────────
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "absolute",
      bottom: "24px",
      right: "24px",
      width: "350px",
      maxHeight: "180px",
      background: "rgba(10, 6, 18, 0.8)",
      border: "1px solid rgba(197,165,90,0.4)",
      borderRadius: "6px",
      padding: "8px 10px",
      boxShadow: "0 0 10px rgba(0,0,0,0.4)",
      pointerEvents: "auto",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      userSelect: "none",
      zIndex: "15",
    } as CSSStyleDeclaration);

    // ── Header ────────────────────────────────────────────────────────────
    const header = document.createElement("div");
    Object.assign(header.style, {
      fontSize: "12px",
      fontWeight: "700",
      color: "#c5a55a",
      marginBottom: "6px",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
    } as CSSStyleDeclaration);
    header.textContent = "Combat Log";
    this.element.appendChild(header);

    // ── Scrollable entries ────────────────────────────────────────────────
    this.logEntries = document.createElement("div");
    this.logEntries.id = "combat-log-global-entries";
    Object.assign(this.logEntries.style, {
      flex: "1",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      maxHeight: "140px",
    } as CSSStyleDeclaration);
    this.element.appendChild(this.logEntries);
  }

  /** Add a new entry to the combat log with optional color. */
  addEntry(text: string, color = "#e8dcc8"): void {
    const entry = document.createElement("div");

    // Timestamp
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    Object.assign(entry.style, {
      fontSize: "11px",
      fontFamily: "'Courier New', monospace",
      lineHeight: "1.3",
      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    } as CSSStyleDeclaration);

    const tsSpan = document.createElement("span");
    tsSpan.style.color = "#888888";
    tsSpan.textContent = `[${ts}] `;

    const msgSpan = document.createElement("span");
    msgSpan.style.color = color;
    msgSpan.textContent = text;

    entry.appendChild(tsSpan);
    entry.appendChild(msgSpan);
    this.logEntries.appendChild(entry);

    // Enforce max entries
    while (this.logEntries.children.length > this.MAX_ENTRIES) {
      this.logEntries.removeChild(this.logEntries.firstChild!);
    }

    // Auto-scroll to bottom
    this.logEntries.scrollTop = this.logEntries.scrollHeight;
  }

  /** Clear all entries. */
  clear(): void {
    this.logEntries.innerHTML = "";
  }
}
