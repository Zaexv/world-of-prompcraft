/**
 * ChatPanel — bottom-left chat panel for multiplayer communication.
 * Shows player messages, NPC dialogue, and system messages.
 */
export class ChatPanel {
  readonly element: HTMLDivElement;
  onSendMessage: ((text: string) => void) | null = null;

  private messagesArea: HTMLDivElement;
  private input: HTMLInputElement;
  private userScrolledUp = false;

  constructor() {
    // ── Container ──────────────────────────────────────────────────────────
    this.element = document.createElement('div');
    Object.assign(this.element.style, {
      position: 'absolute',
      bottom: '12px',
      left: '12px',
      width: '320px',
      height: '200px',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(10, 8, 4, 0.85)',
      border: '1px solid #c5a55a',
      borderRadius: '4px',
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '12px',
      pointerEvents: 'auto',
      zIndex: '20',
    } as CSSStyleDeclaration);

    // ── Messages area ──────────────────────────────────────────────────────
    this.messagesArea = document.createElement('div');
    Object.assign(this.messagesArea.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '6px 8px',
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

    this.element.appendChild(this.messagesArea);

    // ── Input area ─────────────────────────────────────────────────────────
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Press Enter to chat...';
    Object.assign(this.input.style, {
      width: '100%',
      boxSizing: 'border-box',
      padding: '6px 8px',
      background: 'rgba(20, 16, 8, 0.9)',
      border: 'none',
      borderTop: '1px solid rgba(197, 165, 90, 0.3)',
      color: '#ddd',
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
      // Stop propagation so WASD etc. don't trigger while typing
      e.stopPropagation();
    });

    this.element.appendChild(this.input);
  }

  /** Add a player or NPC message to the chat log. */
  addMessage(sender: string, text: string, color = '#ffffff'): void {
    const line = document.createElement('div');
    line.style.lineHeight = '1.4';
    line.innerHTML = `<span style="color: ${color}; font-weight: bold;">[${this.escapeHtml(sender)}]</span> <span style="color: #ddd;">${this.escapeHtml(text)}</span>`;
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

  show(): void {
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
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
