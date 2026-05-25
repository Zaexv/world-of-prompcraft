import { UIComponent } from "./core/UIComponent";

/**
 * World Builder Panel — allows the player to type natural language commands
 * to modify the game world via the WorldBuilder agent.
 * Extends UIComponent for consistent lifecycle management.
 *
 * Toggle with B key or the floating button.
 */
export class WorldBuilderPanel extends UIComponent {
  private input!: HTMLTextAreaElement;
  private responseEl!: HTMLElement;
  private sendBtn!: HTMLButtonElement;

  onSubmit: (prompt: string) => void;

  constructor(onSubmit: (prompt: string) => void) {
    super('ui-root', 'world-builder-panel');
    this.onSubmit = onSubmit;
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      bottom: "90px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "480px",
      background: "rgba(8, 6, 20, 0.92)",
      border: "1px solid rgba(136, 68, 255, 0.5)",
      borderRadius: "10px",
      padding: "16px",
      boxShadow: "0 4px 32px rgba(100, 40, 220, 0.3), 0 0 12px rgba(136, 68, 255, 0.15)",
      backdropFilter: "blur(8px)",
      fontFamily: "system-ui, sans-serif",
      zIndex: "1200",
    } as CSSStyleDeclaration);

    this.container.innerHTML = `
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

    this.input = this.container.querySelector('textarea')!;
    this.responseEl = this.container.querySelector('.wb-response')!;
    this.sendBtn = this.container.querySelector('.wb-send')!;

    const closeBtn = this.container.querySelector('.wb-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.hide());

    this.sendBtn.addEventListener('click', () => this.submit());

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });

    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('keypress', (e) => e.stopPropagation());
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

  protected override onShow(): void {
    setTimeout(() => this.input.focus(), 50);
  }

  get visible(): boolean {
    return this.isVisible;
  }
}
