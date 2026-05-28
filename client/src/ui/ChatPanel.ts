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
      width: '300px',
      height: '180px',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(8,6,18,0.88)',
      border: '1px solid rgba(197,165,90,0.3)',
      borderRadius: '6px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      fontFamily: "'Cinzel', Georgia, serif",
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
    header.textContent = 'Chat — Enter to type';
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
    this.input.placeholder = 'Press Enter to chat...';
    Object.assign(this.input.style, {
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 8px',
      background: 'rgba(0,0,0,0.3)',
      border: 'none',
      borderTop: '1px solid rgba(197, 165, 90, 0.2)',
      color: '#e8dcc8',
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '12px',
      outline: 'none',
    } as CSSStyleDeclaration);

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

    this.container.appendChild(this.input);
  }

  /** Add a player or NPC message to the chat log. */
  addMessage(sender: string, text: string, color = '#ffffff'): void {
    const line = document.createElement('div');
    line.style.lineHeight = '1.4';
    line.innerHTML = `<span style="color: ${color}; font-weight: bold;">[${this.escapeHtml(sender)}]</span> <span style="color: #e8dcc8;">${this.escapeHtml(text)}</span>`;
    this.messagesArea.appendChild(line);
    this.autoScroll();
  }

  /** Add a system message (gray, italic). */
  addSystemMessage(text: string): void {
    const line = document.createElement('div');
    line.style.lineHeight = '1.4';
    line.style.color = '#888';
    line.style.fontStyle = 'italic';
    line.textContent = text;
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
