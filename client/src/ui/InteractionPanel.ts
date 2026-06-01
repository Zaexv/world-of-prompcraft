import { UIComponent } from "./core/UIComponent";
import {
  applyHighlightedText,
  categoryAccent,
  categoryForLabel,
  type Highlight,
  type NpcCategory,
} from "./npcText";

/** Optional per-message styling for NPC dialogue (category accent + highlights). */
export interface NpcMessageStyle {
  category?: NpcCategory;
  highlights?: Highlight[];
}

/** Stored message for per-NPC chat history. */
interface ChatEntry {
  sender: "player" | "npc" | "system";
  text: string;
  ts: string;
  npcName: string;
  category?: NpcCategory;
  highlights?: Highlight[];
}

const DEFAULT_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: "Talk",   prompt: "Hello, what can you tell me about this place?" },
  { label: "Attack", prompt: "I attack you with my weapon!" },
  { label: "Trade",  prompt: "Do you have anything to trade?" },
  { label: "Quest",  prompt: "Do you have any quests for me?" },
];

const NPC_ACTIONS: Record<string, Array<{ label: string; prompt: string }>> = {
  dragon_01: [
    { label: "Attack",    prompt: "I attack you with my weapon!" },
    { label: "Defend",    prompt: "I raise my shield and take a defensive stance" },
    { label: "Negotiate", prompt: "I wish to negotiate peacefully with you" },
    { label: "Flee",      prompt: "I turn and flee!" },
  ],
  merchant_01: [
    { label: "Browse",       prompt: "Show me what you have for sale" },
    { label: "Sell",         prompt: "I'd like to sell some items" },
    { label: "Chat",         prompt: "Hello, what can you tell me about this place?" },
    { label: "Tell a Story", prompt: "Let me tell you an interesting story" },
  ],
  sage_01: [
    { label: "Quest",    prompt: "Do you have any quests for me?" },
    { label: "Wisdom",   prompt: "I seek your ancient wisdom" },
    { label: "Chat",     prompt: "Hello, what can you tell me about this place?" },
    { label: "Blessing", prompt: "Could you bless me for my journey?" },
  ],
  guard_01: [
    { label: "Chat",       prompt: "Hello, what can you tell me about this place?" },
    { label: "Challenge",  prompt: "I challenge you to combat!" },
    { label: "Bribe",      prompt: "Perhaps some gold would change your mind..." },
    { label: "Directions", prompt: "Which way should I go?" },
  ],
  healer_01: [
    { label: "Heal",       prompt: "Please heal my wounds" },
    { label: "Blessing",   prompt: "Could you bless me for my journey?" },
    { label: "Chat",       prompt: "Hello, what can you tell me about this place?" },
    { label: "Protection", prompt: "Can you protect me from the dangers ahead?" },
  ],
  eltito_01: [
    { label: "Quest",    prompt: "Hey tio, got any quests or adventures for me?" },
    { label: "Chill",    prompt: "Hey tio, what's up? Pass me some of that herbal tea" },
    { label: "Talk WoW", prompt: "So what are you playing in WoW right now?" },
    { label: "Lore",     prompt: "Tell me about the Night Elves and Teldrassil" },
  ],
};

function getActionColor(label: string): { border: string; text: string; hover: string; glow: string } {
  const { border, text, hover, glow } = categoryAccent(categoryForLabel(label));
  return { border, text, hover, glow };
}

// Mood colors without emoji (cross-OS safe)
const MOOD_CONFIG: Record<string, { label: string; color: string }> = {
  neutral:  { label: "Neutral",  color: "#888888" },
  happy:    { label: "Happy",    color: "#44cc44" },
  pleased:  { label: "Pleased",  color: "#88cc44" },
  angry:    { label: "Angry",    color: "#cc4444" },
  annoyed:  { label: "Annoyed",  color: "#cc8844" },
  sad:      { label: "Sad",      color: "#4488cc" },
  fearful:  { label: "Fearful",  color: "#8844cc" },
  amused:   { label: "Amused",   color: "#cccc44" },
};

/**
 * Bottom-center NPC dialogue panel.
 * Fixed flex layout so the chat area always fills remaining space and scrolls.
 * Per-NPC history stored as structured data (not innerHTML).
 */
export class InteractionPanel extends UIComponent {
  declare private header: HTMLDivElement;
  declare private moodDot: HTMLSpanElement;
  declare private moodLabel: HTMLSpanElement;
  declare private relFill: HTMLDivElement;
  declare private relLabel: HTMLSpanElement;
  declare private actionBar: HTMLDivElement;
  declare private chatHistory: HTMLDivElement;
  declare private input: HTMLInputElement;

  private npcId   = "";
  private npcName = "";

  // Per-NPC chat history stored as data, not HTML
  private readonly chatHistories = new Map<string, ChatEntry[]>();
  private currentMessages: ChatEntry[] = [];

  onSendMessage: ((prompt: string) => void) | null = null;
  onClose:       (() => void) | null = null;

  constructor() {
    super('ui-root', 'interaction-panel');
  }

  // ── UIComponent overrides ──────────────────────────────────────────────────

  protected override onShow(): void {
    // UIComponent.show() sets display:'block'; we need flex for the layout.
    this.container.style.display = 'flex';
  }

  protected override onHide(): void {
    this.hideThinking();
    if (this.npcId) {
      this.chatHistories.set(this.npcId, [...this.currentMessages]);
      this._pruneHistories();
    }
    this.npcId = "";
    this.currentMessages = [];
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render(): void {
    Object.assign(this.container.style, {
      position:      "absolute",
      bottom:        "62px",
      left:          "50%",
      transform:     "translateX(-50%)",
      width:         "600px",
      height:        "420px",   // taller = more chat visible
      display:       "none",
      flexDirection: "column",
      background:    "rgba(8,6,18,0.95)",
      border:        "1px solid rgba(197,165,90,0.4)",
      borderRadius:  "8px",
      boxShadow:     "0 0 30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(197,165,90,0.2)",
      pointerEvents: "auto",
      fontFamily:    "'Cinzel', 'Times New Roman', serif",
      color:         "#e8dcc8",
      overflow:      "hidden",
    } as CSSStyleDeclaration);

    this._buildHeader();
    this._buildStatusBar();
    this._buildActionBar();
    this._buildChatArea();
    this._buildInput();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  show(npcId: string, npcName: string): void;
  show(): void;
  show(npcId?: string, npcName?: string): void {
    if (npcId !== undefined && npcName !== undefined) {
      // Save current conversation before switching
      if (this.npcId && this.npcId !== npcId) {
        this.chatHistories.set(this.npcId, [...this.currentMessages]);
        this._pruneHistories();
      }

      this.npcId   = npcId;
      this.npcName = npcName;
      this.header.textContent = npcName;

      // Restore this NPC's history
      this.currentMessages = [...(this.chatHistories.get(npcId) ?? [])];
      this._rerenderHistory();

      this.hideThinking();
      this._populateActionBar(npcId);
      super.show();
      // scroll to bottom after display is set to flex
      requestAnimationFrame(() => {
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        this.input.focus();
      });
    } else {
      super.show();
    }
  }

  addMessage(sender: "player" | "npc" | "system", text: string, style?: NpcMessageStyle): void {
    const now = new Date();
    const ts  = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const entry: ChatEntry = {
      sender, text, ts, npcName: this.npcName,
      category: sender === "npc" ? style?.category : undefined,
      highlights: sender === "npc" ? style?.highlights : undefined,
    };
    this.currentMessages.push(entry);
    this._renderEntry(entry, true);
  }

  showThinking(): void {
    if (this.chatHistory.querySelector('#wop-thinking-bubble')) return;
    const row = document.createElement("div");
    row.id = "wop-thinking-bubble";
    Object.assign(row.style, {
      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px",
    } as CSSStyleDeclaration);

    const nameEl = document.createElement("span");
    Object.assign(nameEl.style, {
      fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em",
      color: "#c5a55a", textTransform: "uppercase",
    } as CSSStyleDeclaration);
    nameEl.textContent = this.npcName || "NPC";

    const bubble = document.createElement("div");
    Object.assign(bubble.style, {
      padding: "9px 14px",
      borderRadius: "14px 14px 14px 4px",
      background: "rgba(197,165,90,0.1)",
      border: "1px solid rgba(197,165,90,0.2)",
      color: "#c5a55a",
      fontStyle: "italic",
      fontSize: "13px",
    } as CSSStyleDeclaration);
    bubble.innerHTML = `<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>`;

    row.appendChild(nameEl);
    row.appendChild(bubble);
    this.chatHistory.appendChild(row);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }

  hideThinking(): void {
    this.chatHistory.querySelector('#wop-thinking-bubble')?.remove();
  }

  updateMoodStatus(mood: string, relationshipScore: number): void {
    const cfg = MOOD_CONFIG[mood] ?? MOOD_CONFIG.neutral;
    this.moodDot.style.background   = cfg.color;
    this.moodDot.style.boxShadow    = `0 0 4px ${cfg.color}`;
    this.moodLabel.textContent       = cfg.label;
    this.moodLabel.style.color       = cfg.color;

    const pct = Math.max(0, Math.min(100, (relationshipScore + 100) / 2));
    this.relFill.style.width = `${pct}%`;
    this.relFill.style.background =
      relationshipScore < -30 ? "#cc2222" :
      relationshipScore < 10  ? "#ccaa22" : "#22cc44";

    this.relLabel.textContent =
      relationshipScore <= -50 ? "ENEMY"   :
      relationshipScore <= -10 ? "WARY"    :
      relationshipScore <=  10 ? "STRANGER":
      relationshipScore <=  50 ? "FRIEND"  : "ALLY";
    this.relLabel.style.color =
      relationshipScore <= -50 ? "#cc4444" :
      relationshipScore <= -10 ? "#cc8844" :
      relationshipScore <=  10 ? "rgba(197,165,90,0.6)" :
      relationshipScore <=  50 ? "#88cc44" : "#44cc44";
  }

  clearHistory(npcId: string): void {
    this.chatHistories.delete(npcId);
    if (npcId === this.npcId) {
      this.currentMessages = [];
      this._rerenderHistory();
    }
  }

  get currentNpcId(): string { return this.npcId; }
  get element(): HTMLElement { return this.container; }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _buildHeader(): void {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex", alignItems: "center",
      padding: "10px 16px",
      borderBottom: "1px solid rgba(197,165,90,0.25)",
      flexShrink: "0",
      position: "relative",
    } as CSSStyleDeclaration);

    this.header = document.createElement("div");
    Object.assign(this.header.style, {
      flex: "1", fontSize: "17px", fontWeight: "700",
      color: "#c5a55a", textAlign: "center",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)", letterSpacing: "1px",
    } as CSSStyleDeclaration);
    row.appendChild(this.header);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
      position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
      background: "none", border: "1px solid rgba(197,165,90,0.35)", borderRadius: "4px",
      color: "#c5a55a", fontSize: "14px", cursor: "pointer",
      width: "24px", height: "24px", display: "flex",
      alignItems: "center", justifyContent: "center",
      padding: "0", lineHeight: "1", fontFamily: "inherit",
    } as CSSStyleDeclaration);
    closeBtn.addEventListener("mouseenter", () => { closeBtn.style.background = "rgba(197,165,90,0.15)"; });
    closeBtn.addEventListener("mouseleave", () => { closeBtn.style.background = "none"; });
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); this.onClose?.(); });
    row.appendChild(closeBtn);
    this.container.appendChild(row);
  }

  private _buildStatusBar(): void {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      display: "flex", alignItems: "center", gap: "10px",
      padding: "5px 16px",
      borderBottom: "1px solid rgba(197,165,90,0.12)",
      flexShrink: "0",
      fontSize: "11px",
    } as CSSStyleDeclaration);

    // Mood dot + label
    this.moodDot = document.createElement("span");
    Object.assign(this.moodDot.style, {
      width: "7px", height: "7px", borderRadius: "50%",
      background: "#888", flexShrink: "0",
      transition: "background 0.4s",
    } as CSSStyleDeclaration);

    this.moodLabel = document.createElement("span");
    Object.assign(this.moodLabel.style, {
      color: "#888", fontWeight: "600", whiteSpace: "nowrap",
      transition: "color 0.4s",
    } as CSSStyleDeclaration);
    this.moodLabel.textContent = "Neutral";

    // Relationship
    this.relLabel = document.createElement("span");
    Object.assign(this.relLabel.style, {
      color: "rgba(197,165,90,0.6)", fontSize: "10px", fontWeight: "700",
      letterSpacing: "1px", whiteSpace: "nowrap", marginLeft: "auto",
    } as CSSStyleDeclaration);
    this.relLabel.textContent = "STRANGER";

    const relBarOuter = document.createElement("div");
    Object.assign(relBarOuter.style, {
      width: "80px", height: "5px", background: "rgba(20,10,30,0.8)",
      borderRadius: "3px", overflow: "hidden",
      border: "1px solid rgba(197,165,90,0.2)", flexShrink: "0",
    } as CSSStyleDeclaration);
    this.relFill = document.createElement("div");
    Object.assign(this.relFill.style, {
      height: "100%", width: "50%", background: "#ccaa22",
      borderRadius: "3px", transition: "width 0.5s ease, background 0.5s ease",
    } as CSSStyleDeclaration);
    relBarOuter.appendChild(this.relFill);

    bar.appendChild(this.moodDot);
    bar.appendChild(this.moodLabel);
    bar.appendChild(this.relLabel);
    bar.appendChild(relBarOuter);
    this.container.appendChild(bar);
  }

  private _buildActionBar(): void {
    this.actionBar = document.createElement("div");
    Object.assign(this.actionBar.style, {
      display: "none",
      flexWrap: "wrap",
      gap: "5px",
      padding: "8px 14px",
      borderBottom: "1px solid rgba(197,165,90,0.18)",
      flexShrink: "0",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.actionBar);
  }

  private _buildChatArea(): void {
    this.chatHistory = document.createElement("div");
    Object.assign(this.chatHistory.style, {
      flex: "1",
      minHeight: "0",          // essential for flex child to shrink below content
      overflowY: "auto",
      overflowX: "hidden",
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      scrollBehavior: "smooth",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.chatHistory);
  }

  private _buildInput(): void {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      padding: "10px 12px",
      borderTop: "1px solid rgba(197,165,90,0.2)",
      flexShrink: "0",
      display: "flex",
      gap: "8px",
      alignItems: "center",
    } as CSSStyleDeclaration);

    this.input = document.createElement("input");
    this.input.type        = "text";
    this.input.placeholder = "Say something or type an action…";
    Object.assign(this.input.style, {
      flex: "1",
      padding: "9px 14px",
      border: "1px solid rgba(197,165,90,0.3)",
      borderRadius: "22px",
      background: "rgba(255,255,255,0.04)",
      color: "#e8dcc8",
      fontSize: "13px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      outline: "none",
      transition: "border-color 0.2s",
    } as CSSStyleDeclaration);
    this.input.addEventListener("focus", () => { this.input.style.borderColor = "rgba(197,165,90,0.7)"; });
    this.input.addEventListener("blur",  () => { this.input.style.borderColor = "rgba(197,165,90,0.3)"; });

    const send = () => {
      const text = this.input.value.trim();
      if (!text) return;
      this.addMessage("player", text);
      this.input.value = "";
      this.showThinking();
      this.onSendMessage?.(text);
    };

    this.input.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") send();
      else if (e.key === "Escape") this.onClose?.();
    });

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Send";
    Object.assign(sendBtn.style, {
      padding: "8px 16px",
      border: "1px solid rgba(197,165,90,0.45)",
      borderRadius: "22px",
      background: "rgba(197,165,90,0.18)",
      color: "#c5a55a",
      fontSize: "12px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      cursor: "pointer",
      flexShrink: "0",
      transition: "background 0.15s",
      letterSpacing: "0.04em",
      fontWeight: "700",
    } as CSSStyleDeclaration);
    sendBtn.addEventListener("mouseenter", () => { sendBtn.style.background = "rgba(197,165,90,0.32)"; });
    sendBtn.addEventListener("mouseleave", () => { sendBtn.style.background = "rgba(197,165,90,0.18)"; });
    sendBtn.addEventListener("click", (e) => { e.stopPropagation(); send(); });

    wrap.appendChild(this.input);
    wrap.appendChild(sendBtn);
    this.container.appendChild(wrap);
  }

  private _populateActionBar(npcId: string): void {
    this.actionBar.innerHTML = "";
    const actions = NPC_ACTIONS[npcId] ?? DEFAULT_ACTIONS;
    this.actionBar.style.display = "flex";

    for (const action of actions) {
      const btn = document.createElement("button");
      btn.textContent = action.label;
      const ac = getActionColor(action.label);
      Object.assign(btn.style, {
        padding: "5px 11px",
        border: `1px solid ${ac.border}`,
        borderRadius: "4px",
        background: "rgba(0,0,0,0.4)",
        color: ac.text,
        cursor: "pointer",
        fontSize: "11px",
        whiteSpace: "nowrap",
        fontFamily: "'Cinzel', 'Times New Roman', serif",
        flexShrink: "0",
        transition: "background 0.15s, box-shadow 0.15s",
        letterSpacing: "0.04em",
      } as CSSStyleDeclaration);
      btn.addEventListener("mouseenter", () => {
        btn.style.background = ac.hover;
        btn.style.boxShadow  = `0 0 8px ${ac.glow}`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(0,0,0,0.4)";
        btn.style.boxShadow  = "none";
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.addMessage("player", action.prompt);
        this.showThinking();
        this.onSendMessage?.(action.prompt);
      });
      this.actionBar.appendChild(btn);
    }
  }

  private _rerenderHistory(): void {
    this.chatHistory.innerHTML = "";
    for (const entry of this.currentMessages) {
      this._renderEntry(entry, false);
    }
  }

  private _renderEntry(entry: ChatEntry, scrollToBottom: boolean): void {
    const { sender, text, ts, npcName, category, highlights } = entry;
    const isPlayer = sender === "player";
    const isSystem = sender === "system";

    if (isSystem) {
      const pill = document.createElement("div");
      Object.assign(pill.style, {
        alignSelf: "center",
        fontSize: "11px",
        fontStyle: "italic",
        color: "rgba(220,100,100,0.85)",
        padding: "4px 10px",
        background: "rgba(200,60,60,0.1)",
        borderRadius: "4px",
        border: "1px solid rgba(200,60,60,0.2)",
        textAlign: "center",
        maxWidth: "85%",
      } as CSSStyleDeclaration);
      pill.textContent = text;
      this.chatHistory.appendChild(pill);
    } else {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: isPlayer ? "flex-end" : "flex-start",
        gap: "3px",
      } as CSSStyleDeclaration);

      // Meta line: name + timestamp
      const meta = document.createElement("div");
      Object.assign(meta.style, {
        display: "flex",
        gap: "6px",
        alignItems: "baseline",
        flexDirection: isPlayer ? "row-reverse" : "row",
      } as CSSStyleDeclaration);

      const nameEl = document.createElement("span");
      Object.assign(nameEl.style, {
        fontSize: "10px", fontWeight: "700", letterSpacing: "0.06em",
        color: isPlayer ? "rgba(130,180,240,0.75)" : "#c5a55a",
        textTransform: "uppercase",
      } as CSSStyleDeclaration);
      nameEl.textContent = isPlayer ? "You" : (npcName || "NPC");

      const tsEl = document.createElement("span");
      Object.assign(tsEl.style, {
        fontSize: "9px", color: "rgba(255,255,255,0.18)",
        fontVariantNumeric: "tabular-nums",
      } as CSSStyleDeclaration);
      tsEl.textContent = ts;

      meta.appendChild(nameEl);
      meta.appendChild(tsEl);
      row.appendChild(meta);

      // Bubble — NPC bubbles take a category accent (per-archetype baseline or
      // overridden by the turn's action), so a sale reads differently to a threat.
      const accent = (!isPlayer && category) ? categoryAccent(category) : null;
      const bubble = document.createElement("div");
      Object.assign(bubble.style, {
        maxWidth: "78%",
        padding: "10px 14px",
        borderRadius: isPlayer ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        fontSize: "13px",
        lineHeight: "1.55",
        wordBreak: "break-word",
        background: isPlayer
          ? "rgba(60,110,190,0.24)"
          : (accent?.bubbleBg ?? "rgba(197,165,90,0.13)"),
        border: isPlayer
          ? "1px solid rgba(100,160,220,0.32)"
          : `1px solid ${accent?.bubbleBorder ?? "rgba(197,165,90,0.25)"}`,
        color: isPlayer ? "#c4dcf8" : "#e8dcc8",
        borderLeft: !isPlayer && accent
          ? `3px solid ${accent.border}`
          : undefined,
      } as CSSStyleDeclaration);
      if (!isPlayer && highlights && highlights.length > 0) {
        applyHighlightedText(bubble, text, highlights);
      } else {
        bubble.textContent = text;
      }

      row.appendChild(bubble);
      this.chatHistory.appendChild(row);
    }

    if (scrollToBottom) {
      this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }
  }

  private _pruneHistories(): void {
    const MAX = 50;
    if (this.chatHistories.size > MAX) {
      const excess = this.chatHistories.size - MAX;
      const keys = this.chatHistories.keys();
      for (let i = 0; i < excess; i++) {
        const k = keys.next().value;
        if (k !== undefined) this.chatHistories.delete(k);
      }
    }
  }
}
