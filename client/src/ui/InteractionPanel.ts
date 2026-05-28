import { UIComponent } from "./core/UIComponent";

/**
 * Default action buttons shown for any NPC without specific overrides.
 */
const DEFAULT_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: "Talk",   prompt: "Hello, what can you tell me about this place?" },
  { label: "Attack", prompt: "I attack you with my weapon!" },
  { label: "Trade",  prompt: "Do you have anything to trade?" },
  { label: "Quest",  prompt: "Do you have any quests for me?" },
];

/**
 * Pre-defined action buttons per NPC, keyed by NPC id.
 * Any NPC not listed here gets DEFAULT_ACTIONS.
 */
const NPC_ACTIONS: Record<string, Array<{ label: string; prompt: string }>> = {
  dragon_01: [
    { label: "Attack",    prompt: "I attack you with my weapon!" },
    { label: "Defend",    prompt: "I raise my shield and take a defensive stance" },
    { label: "Negotiate", prompt: "I wish to negotiate peacefully with you" },
    { label: "Flee",      prompt: "I turn and flee!" },
  ],
  merchant_01: [
    { label: "Browse",      prompt: "Show me what you have for sale" },
    { label: "Sell",        prompt: "I'd like to sell some items" },
    { label: "Chat",        prompt: "Hello, what can you tell me about this place?" },
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

/** Returns colour tokens for an action button based on its label. */
function getActionColor(label: string): { border: string; text: string; hover: string; glow: string } {
  const l = label.toLowerCase();
  if (/attack|challenge|fight|flee|defend|strike/.test(l)) {
    return { border: 'rgba(200,60,60,0.5)', text: '#f08888', hover: 'rgba(200,60,60,0.2)', glow: 'rgba(200,60,60,0.4)' };
  }
  if (/heal|heal|bless|protect|restore/.test(l)) {
    return { border: 'rgba(60,180,100,0.5)', text: '#88ddb0', hover: 'rgba(60,180,100,0.2)', glow: 'rgba(60,180,100,0.4)' };
  }
  if (/trade|browse|sell|buy|bribe/.test(l)) {
    return { border: 'rgba(197,165,90,0.5)', text: '#d4b86a', hover: 'rgba(197,165,90,0.2)', glow: 'rgba(197,165,90,0.4)' };
  }
  if (/quest|story|lore|wisdom/.test(l)) {
    return { border: 'rgba(130,160,220,0.5)', text: '#a0b8f0', hover: 'rgba(130,160,220,0.2)', glow: 'rgba(130,160,220,0.4)' };
  }
  return { border: 'rgba(197,165,90,0.3)', text: '#c8c0b0', hover: 'rgba(197,165,90,0.12)', glow: 'rgba(197,165,90,0.3)' };
}

/**
 * Bottom-center chat panel for NPC interactions.
 * WoW-inspired dark-fantasy styling, no framework dependencies.
 * Extends UIComponent for consistent lifecycle management.
 */
export class InteractionPanel extends UIComponent {
  declare private header: HTMLDivElement;
  declare private statusBar: HTMLDivElement;
  declare private moodLabel: HTMLSpanElement;
  declare private relBar: HTMLDivElement;
  declare private relFill: HTMLDivElement;
  declare private relLabel: HTMLSpanElement;
  declare private actionBar: HTMLDivElement;
  declare private chatHistory: HTMLDivElement;
  declare private input: HTMLInputElement;
  private npcId = "";
  private chatHistories: Map<string, string> = new Map();

  /** Fired when the player submits a message. */
  onSendMessage: ((prompt: string) => void) | null = null;
  /** Fired when the player presses Escape. */
  onClose: (() => void) | null = null;

  constructor() {
    super('ui-root', 'interaction-panel');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      bottom: "62px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "600px",
      height: "380px",
      display: "none",
      flexDirection: "column",
      background: "rgba(8,6,18,0.94)",
      border: "1px solid rgba(197,165,90,0.4)",
      borderRadius: "8px",
      boxShadow: "0 0 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(197,165,90,0.25)",
      pointerEvents: "auto",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      color: "#e8dcc8",
      overflow: "hidden",
    } as CSSStyleDeclaration);

    const headerRow = document.createElement("div");
    Object.assign(headerRow.style, {
      display: "flex",
      alignItems: "center",
      padding: "10px 16px",
      borderBottom: "1px solid rgba(197,165,90,0.3)",
      flexShrink: "0",
      position: "relative",
    } as CSSStyleDeclaration);

    this.header = document.createElement("div");
    Object.assign(this.header.style, {
      flex: "1",
      fontSize: "18px",
      fontWeight: "700",
      color: "#c5a55a",
      textAlign: "center",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
      letterSpacing: "1px",
      position: "relative",
    } as CSSStyleDeclaration);
    headerRow.appendChild(this.header);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
      position: "absolute",
      right: "10px",
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "1px solid rgba(197,165,90,0.35)",
      borderRadius: "4px",
      color: "#c5a55a",
      fontSize: "14px",
      cursor: "pointer",
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      lineHeight: "1",
      fontFamily: "inherit",
    } as CSSStyleDeclaration);
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "rgba(197,165,90,0.15)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "none";
    });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onClose?.();
    });
    headerRow.appendChild(closeBtn);
    this.container.appendChild(headerRow);

    this.statusBar = document.createElement("div");
    Object.assign(this.statusBar.style, {
      display: "none",
      alignItems: "center",
      gap: "12px",
      padding: "4px 16px",
      fontSize: "12px",
      borderBottom: "1px solid rgba(197,165,90,0.15)",
      flexShrink: "0",
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
    this.container.appendChild(this.statusBar);

    this.actionBar = document.createElement("div");
    Object.assign(this.actionBar.style, {
      display: "none",
      flexWrap: "nowrap",
      gap: "6px",
      padding: "8px 14px",
      overflowX: "auto",
      borderBottom: "1px solid rgba(197,165,90,0.3)",
      flexShrink: "0",
    } as CSSStyleDeclaration);
    // Hide the action bar's scrollbar — it scrolls silently
    (this.actionBar as unknown as Record<string, string>)['scrollbarWidth'] = 'none';
    this.container.appendChild(this.actionBar);

    this.chatHistory = document.createElement("div");
    Object.assign(this.chatHistory.style, {
      flex: "1",
      minHeight: "0",
      overflowY: "auto",
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    } as CSSStyleDeclaration);
    this.container.appendChild(this.chatHistory);

    const inputWrap = document.createElement("div");
    Object.assign(inputWrap.style, {
      padding: "8px 10px",
      borderTop: "1px solid rgba(197,165,90,0.3)",
      flexShrink: "0",
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
      e.stopPropagation();
    });

    inputWrap.appendChild(this.input);
    this.container.appendChild(inputWrap);
  }

  // Call signature for compatibility
  show(npcId: string, npcName: string): void;
  show(): void;
  show(npcId?: string, npcName?: string): void {
    if (npcId !== undefined && npcName !== undefined) {
      if (this.npcId && this.npcId !== npcId) {
        this.chatHistories.set(this.npcId, this.chatHistory.innerHTML);
        this.pruneHistories();
      }

      this.npcId = npcId;
      this.header.textContent = npcName;
      this.chatHistory.innerHTML = this.chatHistories.get(npcId) ?? "";

      this.hideThinking();
      this.populateActionBar(npcId);
      this.statusBar.style.display = "flex";
      super.show();
      this.input.focus();
    } else {
      super.show();
    }
  }

  private populateActionBar(npcId: string): void {
    this.actionBar.innerHTML = "";
    const actions = NPC_ACTIONS[npcId] ?? DEFAULT_ACTIONS;
    this.actionBar.style.display = "flex";

    for (const action of actions) {
      const btn = document.createElement("button");
      btn.textContent = action.label;
      const actionColor = getActionColor(action.label);
      Object.assign(btn.style, {
        padding: "4px 10px",
        border: `1px solid ${actionColor.border}`,
        borderRadius: "4px",
        background: "rgba(0,0,0,0.45)",
        color: actionColor.text,
        cursor: "pointer",
        fontSize: "11px",
        whiteSpace: "nowrap",
        fontFamily: "'Cinzel', 'Times New Roman', serif",
        flexShrink: "0",
        transition: "background 0.15s, box-shadow 0.15s",
        letterSpacing: "0.03em",
      } as CSSStyleDeclaration);

      btn.addEventListener("mouseenter", () => {
        btn.style.background = actionColor.hover;
        btn.style.boxShadow = `0 0 8px ${actionColor.glow}`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(0,0,0,0.45)";
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

  protected override onHide(): void {
    this.hideThinking();
    if (this.npcId) {
      this.chatHistories.set(this.npcId, this.chatHistory.innerHTML);
      this.pruneHistories();
    }
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
    const isAtBottom = this.chatHistory.scrollHeight - this.chatHistory.scrollTop - this.chatHistory.clientHeight < 50;
    this.chatHistory.appendChild(bubble);
    if (isAtBottom) {
      this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    }
  }

  showThinking(): void {
    if (this.chatHistory.querySelector('#wop-thinking-bubble')) return;
    const bubble = document.createElement("div");
    bubble.id = "wop-thinking-bubble";
    Object.assign(bubble.style, {
      maxWidth: "80%",
      padding: "8px 12px",
      borderRadius: "8px",
      fontSize: "13px",
      alignSelf: "flex-start",
      background: "rgba(160, 120, 50, 0.2)",
      border: "1px solid rgba(197, 165, 90, 0.25)",
      color: "#c5a55a",
      fontStyle: "italic",
    } as CSSStyleDeclaration);
    bubble.innerHTML = `<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>`;
    this.chatHistory.appendChild(bubble);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }

  hideThinking(): void {
    const bubble = this.chatHistory.querySelector('#wop-thinking-bubble');
    bubble?.remove();
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

  updateMoodStatus(mood: string, relationshipScore: number): void {
    const info = InteractionPanel.MOOD_DISPLAY[mood] ?? InteractionPanel.MOOD_DISPLAY.neutral;
    this.moodLabel.textContent = `${info.emoji} ${mood.charAt(0).toUpperCase() + mood.slice(1)}`;
    this.moodLabel.style.color = info.color;

    const pct = Math.max(0, Math.min(100, (relationshipScore + 100) / 2));
    this.relFill.style.width = `${pct}%`;

    if (relationshipScore < -30) {
      this.relFill.style.background = "#cc2222";
    } else if (relationshipScore < 10) {
      this.relFill.style.background = "#ccaa22";
    } else {
      this.relFill.style.background = "#22cc44";
    }

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

  clearHistory(npcId: string): void {
    this.chatHistories.delete(npcId);
  }

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

  get currentNpcId(): string {
    return this.npcId;
  }

  get element(): HTMLElement {
    return this.container;
  }
}
