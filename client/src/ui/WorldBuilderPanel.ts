/**
 * World Builder Panel — allows the player to type natural language commands
 * to modify the game world via the WorldBuilder agent.
 *
 * Toggle with B key or the floating button.
 */
export class WorldBuilderPanel {
  private panel: HTMLElement;
  private input: HTMLTextAreaElement;
  private responseEl: HTMLElement;
  private sendBtn: HTMLButtonElement;
  private isOpen = false;
  private onSubmit: (prompt: string) => void;

  constructor(container: HTMLElement, onSubmit: (prompt: string) => void) {
    void container; // retained for potential future use (e.g. parent-relative positioning)
    this.onSubmit = onSubmit;
    this.panel = this.buildPanel();
    this.input = this.panel.querySelector('textarea')!;
    this.responseEl = this.panel.querySelector('.wb-response')!;
    this.sendBtn = this.panel.querySelector('.wb-send')!;
    container.appendChild(this.panel);
    this.hide();
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      bottom: 90px;
      left: 50%;
      transform: translateX(-50%);
      width: 480px;
      background: rgba(8, 6, 20, 0.92);
      border: 1px solid rgba(136, 68, 255, 0.5);
      border-radius: 10px;
      padding: 16px;
      box-shadow: 0 4px 32px rgba(100, 40, 220, 0.3), 0 0 12px rgba(136, 68, 255, 0.15);
      backdrop-filter: blur(8px);
      font-family: system-ui, sans-serif;
      z-index: 1200;
    `;

    panel.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <div style="width:10px; height:10px; border-radius:50%; background:#8844ff; box-shadow:0 0 6px #8844ff;"></div>
        <span style="color:#c8b4ff; font-size:13px; font-weight:600; letter-spacing:0.5px;">WORLD SPIRIT</span>
        <span style="color:#776699; font-size:11px; margin-left:4px;">— shape the world with words</span>
        <button class="wb-close" style="margin-left:auto; background:none; border:none; color:#665588; cursor:pointer; font-size:18px; line-height:1;">×</button>
      </div>
      <div class="wb-response" style="
        min-height: 32px;
        max-height: 80px;
        overflow-y: auto;
        color: #b8a0e0;
        font-size: 12px;
        font-style: italic;
        margin-bottom: 10px;
        padding: 6px 8px;
        background: rgba(80, 40, 120, 0.2);
        border-radius: 6px;
        border-left: 2px solid rgba(136, 68, 255, 0.4);
        display: none;
      "></div>
      <div style="display:flex; gap:8px; align-items:flex-end;">
        <textarea
          placeholder="Describe what you want to build... (e.g. 'place a moonwell near me' or 'add some glowing crystals')"
          rows="2"
          style="
            flex: 1;
            background: rgba(30, 20, 50, 0.8);
            border: 1px solid rgba(136, 68, 255, 0.3);
            border-radius: 6px;
            color: #e0d4ff;
            font-size: 13px;
            padding: 8px 10px;
            resize: none;
            outline: none;
            font-family: inherit;
          "
        ></textarea>
        <button class="wb-send" style="
          background: linear-gradient(135deg, #5522aa, #8844ff);
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 16px;
          cursor: pointer;
          white-space: nowrap;
          height: 56px;
        ">✦ Build</button>
      </div>
      <div style="color:#554477; font-size:10px; margin-top:6px; text-align:center;">Press B to toggle · Enter to send · Shift+Enter for new line</div>
    `;

    const closeBtn = panel.querySelector('.wb-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.hide());

    const textarea = panel.querySelector('textarea') as HTMLTextAreaElement;
    const sendBtn = panel.querySelector('.wb-send') as HTMLButtonElement;

    sendBtn.addEventListener('click', () => this.submit());

    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });

    textarea.addEventListener('keyup', (e) => e.stopPropagation());
    textarea.addEventListener('keypress', (e) => e.stopPropagation());

    return panel;
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    this.setResponse('The World Spirit considers your request...');
    this.sendBtn.disabled = true;
    this.onSubmit(text);
  }

  setResponse(text: string): void {
    this.responseEl.textContent = text;
    this.responseEl.style.display = 'block';
  }

  setReady(): void {
    this.sendBtn.disabled = false;
  }

  toggle(): void {
    if (this.isOpen) this.hide(); else this.show();
  }

  show(): void {
    this.panel.style.display = 'block';
    this.isOpen = true;
    setTimeout(() => this.input.focus(), 50);
  }

  hide(): void {
    this.panel.style.display = 'none';
    this.isOpen = false;
  }

  get visible(): boolean {
    return this.isOpen;
  }
}
