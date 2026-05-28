import { UIComponent } from "./core/UIComponent";

/**
 * ChatPanel — bottom-left chat panel for multiplayer communication.
 * Shows player messages, NPC dialogue, and system messages.
 * Extends UIComponent for consistent lifecycle management.
 */
export class ChatPanel extends UIComponent {
  onSendMessage: ((text: string) => void) | null = null;

  declare private messagesArea: HTMLDivElement;
  declare private input: HTMLInputElement;
  private userScrolledUp = false;

  constructor() {
    super('ui-root', 'chat-panel');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: 'absolute',
      bottom: '62px',
      left: '12px',
      width: '310px',
      height: '200px',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(8,6,18,0.88)',
      border: '1px solid rgba(197,165,90,0.3)',
      borderRadius: '6px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontSize: '12px',
      pointerEvents: 'auto',
      zIndex: '20',
      overflow: 'hidden',
    } as CSSStyleDeclaration);

    // ── Compact header ─────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '4px 8px',
      fontSize: '9px',
      fontWeight: '700',
      color: 'rgba(197,165,90,0.6)',
      letterSpacing: '2px',
      textTransform: 'uppercase',
      borderBottom: '1px solid rgba(197,165,90,0.15)',
      flexShrink: '0',
    } as CSSStyleDeclaration);
    header.textContent = 'World Chat';
    this.container.appendChild(header);

    // ── Messages area ──────────────────────────────────────────────────────
    this.messagesArea = document.createElement('div');
    Object.assign(this.messagesArea.style, {
      flex: '1',
      minHeight: '0',
      overflowY: 'auto',
      padding: '4px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    } as CSSStyleDeclaration);

    // Track whether user scrolled up
    this.messagesArea.addEventListener('scroll', () => {
      const el = this.messagesArea;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
      this.userScrolledUp = !atBottom;
    });

    this.container.appendChild(this.messagesArea);

    // ── Input area ─────────────────────────────────────────────────────────
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Message nearby players...';
    Object.assign(this.input.style, {
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 12px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(197,165,90,0.25)',
      borderRadius: '14px',
      color: '#e8dcc8',
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontSize: '12px',
      outline: 'none',
      transition: 'border-color 0.2s',
    } as CSSStyleDeclaration);
    this.input.addEventListener('focus',  () => { this.input.style.borderColor = 'rgba(197,165,90,0.6)'; });
    this.input.addEventListener('blur',   () => { this.input.style.borderColor = 'rgba(197,165,90,0.25)'; });

    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.input.value.trim();
        if (text && this.onSendMessage) {
          this.onSendMessage(text);
          this.input.value = '';
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.input.blur();
      }
      e.stopPropagation();
    });

    const inputWrap = document.createElement('div');
    Object.assign(inputWrap.style, {
      padding: '6px 8px',
      borderTop: '1px solid rgba(197,165,90,0.15)',
      flexShrink: '0',
    } as CSSStyleDeclaration);
    inputWrap.appendChild(this.input);
    this.container.appendChild(inputWrap);
  }

  /** Add a player or NPC message to the chat log. */
  addMessage(sender: string, text: string, color = '#c5a55a'): void {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
      padding: '3px 0',
      borderBottom: '1px solid rgba(197,165,90,0.06)',
    } as CSSStyleDeclaration);

    const meta = document.createElement('div');
    Object.assign(meta.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    } as CSSStyleDeclaration);

    const senderEl = document.createElement('span');
    Object.assign(senderEl.style, {
      fontSize: '10px',
      fontWeight: '700',
      color,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    } as CSSStyleDeclaration);
    senderEl.textContent = this.escapeHtml(sender);

    const tsEl = document.createElement('span');
    Object.assign(tsEl.style, {
      fontSize: '9px',
      color: 'rgba(255,255,255,0.18)',
      fontVariantNumeric: 'tabular-nums',
    } as CSSStyleDeclaration);
    tsEl.textContent = ts;

    meta.appendChild(senderEl);
    meta.appendChild(tsEl);
    row.appendChild(meta);

    const body = document.createElement('div');
    Object.assign(body.style, {
      fontSize: '12px',
      color: '#d8ceb8',
      lineHeight: '1.4',
      wordBreak: 'break-word',
    } as CSSStyleDeclaration);
    body.textContent = this.escapeHtml(text);
    row.appendChild(body);

    this.messagesArea.appendChild(row);
    this.autoScroll();
  }

  /** Add a system message (centered, muted). */
  addSystemMessage(text: string): void {
    const line = document.createElement('div');
    Object.assign(line.style, {
      fontSize: '10px',
      color: 'rgba(197,165,90,0.45)',
      fontStyle: 'italic',
      textAlign: 'center',
      padding: '3px 0',
      letterSpacing: '0.02em',
    } as CSSStyleDeclaration);
    line.textContent = `— ${this.escapeHtml(text)} —`;
    this.messagesArea.appendChild(line);
    this.autoScroll();
  }

  /** Focus the input field. */
  focusInput(): void {
    this.input.focus();
  }

  /** Whether the input is currently focused. */
  get isFocused(): boolean {
    return document.activeElement === this.input;
  }

  get element(): HTMLElement {
    return this.container;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private autoScroll(): void {
    if (!this.userScrolledUp) {
      this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
