/**
 * Default action buttons shown for any NPC without specific overrides.
 */
const DEFAULT_ACTIONS: Array<{ icon: string; label: string; prompt: string }> = [
  { icon: "\uD83D\uDDE3\uFE0F", label: "Talk", prompt: "Hello, what can you tell me about this place?" },
  { icon: "\u2694\uFE0F", label: "Attack", prompt: "I attack you with my weapon!" },
  { icon: "\uD83D\uDED2", label: "Trade", prompt: "Do you have anything to trade?" },
  { icon: "\uD83D\uDCDC", label: "Quest", prompt: "Do you have any quests for me?" },
];

/**
 * Pre-defined action buttons per NPC, keyed by NPC id.
 * Any NPC not listed here gets DEFAULT_ACTIONS.
 */
const NPC_ACTIONS: Record<string, Array<{ icon: string; label: string; prompt: string }>> = {
  dragon_01: [
    { icon: "\u2694\uFE0F", label: "Attack", prompt: "I attack you with my weapon!" },
    { icon: "\uD83D\uDEE1\uFE0F", label: "Defend", prompt: "I raise my shield and take a defensive stance" },
    { icon: "\uD83D\uDDE3\uFE0F", label: "Negotiate", prompt: "I wish to negotiate peacefully with you" },
    { icon: "\uD83C\uDFC3", label: "Flee", prompt: "I turn and flee!" },
  ],
  merchant_01: [
    { icon: "\uD83D\uDED2", label: "Browse Wares", prompt: "Show me what you have for sale" },
    { icon: "\uD83D\uDCB0", label: "Sell Items", prompt: "I'd like to sell some items" },
    { icon: "\uD83D\uDDE3\uFE0F", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "\uD83D\uDCD6", label: "Tell a Story", prompt: "Let me tell you an interesting story" },
  ],
  sage_01: [
    { icon: "\uD83D\uDCDC", label: "Ask for Quest", prompt: "Do you have any quests for me?" },
    { icon: "\uD83D\uDD2E", label: "Seek Wisdom", prompt: "I seek your ancient wisdom" },
    { icon: "\uD83D\uDDE3\uFE0F", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "\uD83D\uDE4F", label: "Request Blessing", prompt: "Could you bless me for my journey?" },
  ],
  guard_01: [
    { icon: "\uD83D\uDDE3\uFE0F", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "\u2694\uFE0F", label: "Challenge", prompt: "I challenge you to combat!" },
    { icon: "\uD83D\uDCB0", label: "Bribe", prompt: "Perhaps some gold would change your mind..." },
    { icon: "\u2139\uFE0F", label: "Ask Directions", prompt: "Which way should I go?" },
  ],
  healer_01: [
    { icon: "\u2764\uFE0F", label: "Request Healing", prompt: "Please heal my wounds" },
    { icon: "\uD83D\uDE4F", label: "Request Blessing", prompt: "Could you bless me for my journey?" },
    { icon: "\uD83D\uDDE3\uFE0F", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "\uD83D\uDEE1\uFE0F", label: "Ask for Protection", prompt: "Can you protect me from the dangers ahead?" },
  ],
  eltito_01: [
    { icon: "\u2728", label: "Quest", prompt: "Hey tio, got any quests or adventures for me?" },
    { icon: "\uD83C\uDF3F", label: "Chill", prompt: "Hey tio, what's up? Pass me some of that herbal tea" },
    { icon: "\uD83C\uDFAE", label: "Talk WoW", prompt: "So what are you playing in WoW right now?" },
    { icon: "\uD83D\uDCDA", label: "Lore", prompt: "Tell me about the Night Elves and Teldrassil" },
  ],
};

/**
 * Bottom-center chat panel for NPC interactions.
 * WoW-inspired dark-fantasy styling, no framework dependencies.
 */
export class InteractionPanel {
  readonly element: HTMLDivElement;
  private header: HTMLDivElement;
  private statusBar: HTMLDivElement;
  private moodLabel: HTMLSpanElement;
  private relBar: HTMLDivElement;
  private relFill: HTMLDivElement;
  private relLabel: HTMLSpanElement;
  private actionBar: HTMLDivElement;
  private chatHistory: HTMLDivElement;
  private input: HTMLInputElement;
  private thinkingEl: HTMLDivElement;
  private npcId = "";
  private chatHistories: Map<string, string> = new Map();

  /** Fired when the player submits a message. */
  onSendMessage: ((prompt: string) => void) | null = null;
  /** Fired when the player presses Escape. */
  onClose: (() => void) | null = null;

  constructor() {
    // ── Root container ────────────────────────────────────────────────────
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "absolute",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "600px",
      maxHeight: "400px",
      display: "none",
      flexDirection: "column",
      background: "linear-gradient(180deg, rgba(26,17,8,0.92) 0%, rgba(20,12,4,0.96) 100%)",
      border: "2px solid #c5a55a",
      borderRadius: "8px",
      boxShadow: "0 0 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(197,165,90,0.25)",
      pointerEvents: "auto",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      color: "#e8dcc8",
      overflow: "hidden",
    } as CSSStyleDeclaration);

    // ── Header ───────────────────────────────────────────────────────────
    this.header = document.createElement("div");
    Object.assign(this.header.style, {
      padding: "10px 16px",
      fontSize: "18px",
      fontWeight: "700",
      color: "#c5a55a",
      textAlign: "center",
      borderBottom: "1px solid rgba(197,165,90,0.3)",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
      letterSpacing: "1px",
    } as CSSStyleDeclaration);
    this.element.appendChild(this.header);

    // ── Mood & Relationship status bar ────────────────────────────────
    this.statusBar = document.createElement("div");
    Object.assign(this.statusBar.style, {
      display: "none",
      alignItems: "center",
      gap: "12px",
      padding: "4px 16px",
      fontSize: "12px",
      borderBottom: "1px solid rgba(197,165,90,0.15)",
    } as CSSStyleDeclaration);

    this.moodLabel = document.createElement("span");
    Object.assign(this.moodLabel.style, {
      color: "#888",
      fontWeight: "600",
      whiteSpace: "nowrap",
    } as CSSStyleDeclaration);
    this.moodLabel.textContent = "😐 Neutral";
    this.statusBar.appendChild(this.moodLabel);

    const relWrap = document.createElement("span");
    Object.assign(relWrap.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flex: "1",
    } as CSSStyleDeclaration);

    this.relLabel = document.createElement("span");
    Object.assign(this.relLabel.style, {
      color: "rgba(197,165,90,0.6)",
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "1px",
      whiteSpace: "nowrap",
    } as CSSStyleDeclaration);
    this.relLabel.textContent = "STRANGER";
    relWrap.appendChild(this.relLabel);

    this.relBar = document.createElement("div");
    Object.assign(this.relBar.style, {
      flex: "1",
      height: "6px",
      background: "rgba(20,10,30,0.8)",
      borderRadius: "3px",
      overflow: "hidden",
      border: "1px solid rgba(197,165,90,0.3)",
    } as CSSStyleDeclaration);

    this.relFill = document.createElement("div");
    Object.assign(this.relFill.style, {
      height: "100%",
      width: "50%",
      background: "#ccaa22",
      borderRadius: "3px",
      transition: "width 0.5s ease, background 0.5s ease",
    } as CSSStyleDeclaration);
    this.relBar.appendChild(this.relFill);
    relWrap.appendChild(this.relBar);
    this.statusBar.appendChild(relWrap);
    this.element.appendChild(this.statusBar);

    // ── Action bar ─────────────────────────────────────────────────────
    this.actionBar = document.createElement("div");
    Object.assign(this.actionBar.style, {
      display: "none",
      flexWrap: "nowrap",
      gap: "6px",
      padding: "8px 14px",
      overflowX: "auto",
      borderBottom: "1px solid rgba(197,165,90,0.3)",
    } as CSSStyleDeclaration);
    this.element.appendChild(this.actionBar);

    // Hide scrollbar on action bar but keep it scrollable
    const actionBarStyle = document.createElement("style");
    actionBarStyle.textContent = `
      #interaction-action-bar::-webkit-scrollbar { display: none; }
      #interaction-action-bar { -ms-overflow-style: none; scrollbar-width: none; }
    `;
    document.head.appendChild(actionBarStyle);
    this.actionBar.id = "interaction-action-bar";

    // ── Chat history ─────────────────────────────────────────────────────
    this.chatHistory = document.createElement("div");
    Object.assign(this.chatHistory.style, {
      flex: "1",
      overflowY: "auto",
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      maxHeight: "280px",
    } as CSSStyleDeclaration);
    this.element.appendChild(this.chatHistory);

    // Custom scrollbar styling
    const styleTag = document.createElement("style");
    styleTag.textContent = `
      #interaction-chat::-webkit-scrollbar { width: 6px; }
      #interaction-chat::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 3px; }
      #interaction-chat::-webkit-scrollbar-thumb { background: #c5a55a; border-radius: 3px; }
    `;
    document.head.appendChild(styleTag);
    this.chatHistory.id = "interaction-chat";

    // ── Thinking indicator ───────────────────────────────────────────────
    this.thinkingEl = document.createElement("div");
    Object.assign(this.thinkingEl.style, {
      padding: "6px 14px",
      display: "none",
      alignItems: "center",
      gap: "4px",
      color: "#c5a55a",
      fontSize: "14px",
      fontStyle: "italic",
    } as CSSStyleDeclaration);
    this.thinkingEl.innerHTML = `<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>`;
    this.element.appendChild(this.thinkingEl);

    // Dot animation
    const dotStyle = document.createElement("style");
    dotStyle.textContent = `
      .thinking-dots span { animation: dot-blink 1.4s infinite; opacity: 0; }
      .thinking-dots span:nth-child(1) { animation-delay: 0s; }
      .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
      .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes dot-blink { 0%,20% { opacity:0; } 50% { opacity:1; } 100% { opacity:0; } }
    `;
    document.head.appendChild(dotStyle);

    // ── Input bar ────────────────────────────────────────────────────────
    const inputWrap = document.createElement("div");
    Object.assign(inputWrap.style, {
      padding: "8px 10px",
      borderTop: "1px solid rgba(197,165,90,0.3)",
    } as CSSStyleDeclaration);

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.placeholder = "Type your action...";
    Object.assign(this.input.style, {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #c5a55a",
      borderRadius: "4px",
      background: "rgba(0,0,0,0.5)",
      color: "#e8dcc8",
      fontSize: "14px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      outline: "none",
    } as CSSStyleDeclaration);

    this.input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const text = this.input.value.trim();
        if (text.length > 0) {
          this.addMessage("player", text);
          this.input.value = "";
          this.showThinking();
          this.onSendMessage?.(text);
        }
      } else if (e.key === "Escape") {
        this.onClose?.();
      }
      // Stop event from reaching game controls
      e.stopPropagation();
    });

    inputWrap.appendChild(this.input);
    this.element.appendChild(inputWrap);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  show(npcId: string, npcName: string): void {
    // Save current NPC's chat history before switching
    if (this.npcId && this.npcId !== npcId) {
      this.chatHistories.set(this.npcId, this.chatHistory.innerHTML);
      this.pruneHistories();
    }

    this.npcId = npcId;
    this.header.textContent = npcName;

    // Restore target NPC's history or clear
    this.chatHistory.innerHTML = this.chatHistories.get(npcId) ?? "";

    this.hideThinking();
    this.populateActionBar(npcId);
    this.statusBar.style.display = "flex";
    this.element.style.display = "flex";
    this.input.focus();
  }

  private populateActionBar(npcId: string): void {
    this.actionBar.innerHTML = "";
    // Use NPC-specific actions if available, otherwise show default actions
    const actions = NPC_ACTIONS[npcId] ?? DEFAULT_ACTIONS;

    this.actionBar.style.display = "flex";

    for (const action of actions) {
      const btn = document.createElement("button");
      btn.textContent = `${action.icon} ${action.label}`;
      Object.assign(btn.style, {
        padding: "4px 10px",
        border: "1px solid #c5a55a",
        borderRadius: "4px",
        background: "rgba(0,0,0,0.4)",
        color: "#e8dcc8",
        cursor: "pointer",
        fontSize: "12px",
        whiteSpace: "nowrap",
        fontFamily: "'Cinzel', 'Times New Roman', serif",
        flexShrink: "0",
        transition: "background 0.15s, box-shadow 0.15s",
      } as CSSStyleDeclaration);

      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(197,165,90,0.2)";
        btn.style.boxShadow = "0 0 8px rgba(197,165,90,0.4)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(0,0,0,0.4)";
        btn.style.boxShadow = "none";
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

  hide(): void {
    // Save chat history before hiding
    if (this.npcId) {
      this.chatHistories.set(this.npcId, this.chatHistory.innerHTML);
      this.pruneHistories();
    }
    this.hideThinking();
    this.element.style.display = "none";
    this.npcId = "";
  }

  addMessage(sender: "player" | "npc" | "system", text: string): void {
    const bubble = document.createElement("div");
    const isPlayer = sender === "player";
    const isSystem = sender === "system";

    const bgMap = {
      player: "rgba(100, 160, 220, 0.25)",
      npc: "rgba(160, 120, 50, 0.3)",
      system: "rgba(200, 60, 60, 0.25)",
    } as const;
    const borderMap = {
      player: "1px solid rgba(100, 160, 220, 0.4)",
      npc: "1px solid rgba(197, 165, 90, 0.35)",
      system: "1px solid rgba(200, 60, 60, 0.35)",
    } as const;
    const colorMap = {
      player: "#b8d8f8",
      npc: "#e8d8b8",
      system: "#f8b8b8",
    } as const;

    Object.assign(bubble.style, {
      maxWidth: "80%",
      padding: "8px 12px",
      borderRadius: "8px",
      fontSize: isSystem ? "12px" : "13px",
      lineHeight: "1.45",
      wordBreak: "break-word",
      fontStyle: isSystem ? "italic" : "normal",
      alignSelf: isPlayer ? "flex-end" : "flex-start",
      background: bgMap[sender],
      border: borderMap[sender],
      color: colorMap[sender],
    } as CSSStyleDeclaration);

    bubble.textContent = text;
    // Smart auto-scroll: only scroll if user is already at bottom
    const isAtBottom = this.chatHistory.scrollHeight - this.chatHistory.scrollTop - this.chatHistory.clientHeight < 50;
    this.chatHistory.appendChild(bubble);
    if (isAtBottom) {
      this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }
  }

  showThinking(): void {
    this.thinkingEl.style.display = "flex";
  }

  hideThinking(): void {
    this.thinkingEl.style.display = "none";
  }

  private static readonly MOOD_DISPLAY: Record<string, { emoji: string; color: string }> = {
    neutral: { emoji: "😐", color: "#888888" },
    happy: { emoji: "😊", color: "#44cc44" },
    pleased: { emoji: "🙂", color: "#88cc44" },
    angry: { emoji: "😠", color: "#cc4444" },
    annoyed: { emoji: "😒", color: "#cc8844" },
    sad: { emoji: "😢", color: "#4488cc" },
    fearful: { emoji: "😰", color: "#8844cc" },
    amused: { emoji: "😄", color: "#cccc44" },
  };

  /** Update the mood emoji and relationship bar in the status section. */
  updateMoodStatus(mood: string, relationshipScore: number): void {
    const info = InteractionPanel.MOOD_DISPLAY[mood] ?? InteractionPanel.MOOD_DISPLAY.neutral;
    this.moodLabel.textContent = `${info.emoji} ${mood.charAt(0).toUpperCase() + mood.slice(1)}`;
    this.moodLabel.style.color = info.color;

    // Relationship bar fill: -100..100 → 0..100%
    const pct = Math.max(0, Math.min(100, (relationshipScore + 100) / 2));
    this.relFill.style.width = `${pct}%`;

    // Bar color
    if (relationshipScore < -30) {
      this.relFill.style.background = "#cc2222";
    } else if (relationshipScore < 10) {
      this.relFill.style.background = "#ccaa22";
    } else {
      this.relFill.style.background = "#22cc44";
    }

    // Tier label
    if (relationshipScore <= -50) {
      this.relLabel.textContent = "ENEMY";
      this.relLabel.style.color = "#cc4444";
    } else if (relationshipScore <= -10) {
      this.relLabel.textContent = "WARY";
      this.relLabel.style.color = "#cc8844";
    } else if (relationshipScore <= 10) {
      this.relLabel.textContent = "STRANGER";
      this.relLabel.style.color = "rgba(197,165,90,0.6)";
    } else if (relationshipScore <= 50) {
      this.relLabel.textContent = "FRIEND";
      this.relLabel.style.color = "#88cc44";
    } else {
      this.relLabel.textContent = "ALLY";
      this.relLabel.style.color = "#44cc44";
    }
  }

  /** Remove chat history for a specific NPC. Call when an NPC is removed. */
  clearHistory(npcId: string): void {
    this.chatHistories.delete(npcId);
  }

  /**
   * Prune the chat history map if it exceeds the max size (50 entries).
   * Deletes the oldest entries (earliest inserted) to stay within the limit.
   */
  private pruneHistories(): void {
    const MAX_HISTORIES = 50;
    if (this.chatHistories.size > MAX_HISTORIES) {
      const excess = this.chatHistories.size - MAX_HISTORIES;
      const keys = this.chatHistories.keys();
      for (let i = 0; i < excess; i++) {
        const oldest = keys.next().value;
        if (oldest !== undefined) {
          this.chatHistories.delete(oldest);
        }
      }
    }
  }

  /** The NPC ID currently shown, or empty string. */
  get currentNpcId(): string {
    return this.npcId;
  }
}
