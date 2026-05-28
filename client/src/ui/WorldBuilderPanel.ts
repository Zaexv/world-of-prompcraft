import { UIComponent } from "./core/UIComponent";

/**
 * World Builder Panel — allows the player to type natural language commands
 * to modify the game world via the WorldBuilder agent.
 * Extends UIComponent for consistent lifecycle management.
 *
 * Toggle with B key or the floating button.
 */
export class WorldBuilderPanel extends UIComponent {
  declare private input: HTMLTextAreaElement;
  declare private responseEl: HTMLElement;
  declare private sendBtn: HTMLButtonElement;
  declare private progressContainer: HTMLElement;
  declare private historyLog: HTMLElement;
  declare private fileInput: HTMLInputElement;
  declare private attachmentPreview: HTMLElement;

  private selectedFile: File | null = null;
  private streamingBlueprints: Map<string, { total: number, received: number }> = new Map();

  onSubmit: (prompt: string, attachment?: File) => void;
  onUndo: () => void;
  onRedo: () => void;

  constructor(
    onSubmit: (prompt: string, attachment?: File) => void,
    onUndo: () => void,
    onRedo: () => void
  ) {
    super('game-ui', 'world-builder-panel');
    this.onSubmit = onSubmit;
    this.onUndo = onUndo;
    this.onRedo = onRedo;
    
    this.setupShortcuts();
  }

  private setupShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        if (e.shiftKey) {
          this.onRedo();
          this.addToHistory('Redo');
        } else {
          this.onUndo();
          this.addToHistory('Undo');
        }
      }
    });
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
      width: "520px",
      background: "rgba(10, 8, 20, 0.95)",
      border: "1px solid rgba(197, 165, 90, 0.4)",
      borderRadius: "10px",
      padding: "16px",
      boxShadow: "0 4px 32px rgba(0, 0, 0, 0.6), 0 0 12px rgba(197, 165, 90, 0.1)",
      backdropFilter: "blur(8px)",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      zIndex: "1200",
      display: "none",
      flexDirection: "column",
      gap: "10px"
    } as CSSStyleDeclaration);

    this.container.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:10px; height:10px; border-radius:50%; background:#c5a55a; box-shadow:0 0 6px rgba(197,165,90,0.8);"></div>
        <span style="color:#e8dcc8; font-size:13px; font-weight:600; letter-spacing:0.5px;">WORLD SPIRIT</span>
        <span style="color:#aaaaaa; font-size:11px; margin-left:4px;">— shape the world with words</span>
        <button class="wb-close" style="margin-left:auto; background:none; border:none; color:#c5a55a; cursor:pointer; font-size:18px; line-height:1;">×</button>
      </div>

      <div class="wb-history" style="
        max-height: 100px;
        overflow-y: auto;
        background: rgba(0,0,0,0.3);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        color: #aaaaaa;
        display: none;
      "></div>

      <div class="wb-response" style="
        min-height: 32px;
        max-height: 80px;
        overflow-y: auto;
        color: #e8dcc8;
        font-size: 12px;
        font-style: italic;
        padding: 6px 8px;
        background: rgba(197, 165, 90, 0.08);
        border-radius: 6px;
        border-left: 2px solid rgba(197, 165, 90, 0.4);
        display: none;
      "></div>

      <div class="wb-progress-container" style="display:none; flex-direction:column; gap:4px;">
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#aaa;">
          <span>Streaming Blueprint...</span>
          <span class="wb-progress-text">0%</span>
        </div>
        <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
          <div class="wb-progress-bar" style="width:0%; height:100%; background:#c5a55a; transition:width 0.2s;"></div>
        </div>
      </div>

      <div class="wb-attachment-preview" style="display:none; align-items:center; gap:8px; background:rgba(197,165,90,0.1); padding:4px 8px; border-radius:4px;">
        <span style="font-size:11px; color:#e8dcc8; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
        <button class="wb-remove-attachment" style="background:none; border:none; color:#ff4444; cursor:pointer; font-size:14px;">×</button>
      </div>

      <div style="display:flex; gap:8px; align-items:flex-end;">
        <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
          <textarea
            placeholder="Describe what you want to build..."
            rows="2"
            style="
              background: rgba(10, 8, 20, 0.8);
              border: 1px solid rgba(197, 165, 90, 0.3);
              border-radius: 6px;
              color: #e8dcc8;
              font-size: 13px;
              padding: 8px 10px;
              resize: none;
              outline: none;
              font-family: inherit;
            "
          ></textarea>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <input type="file" class="wb-file-input" style="display:none;" accept="image/*">
          <button class="wb-attach" title="Attach Image" style="
            background: rgba(197, 165, 90, 0.15);
            border: 1px solid rgba(197, 165, 90, 0.3);
            border-radius: 6px;
            color: #c5a55a;
            padding: 8px;
            cursor: pointer;
            height: 36px;
          ">📷</button>
          <button class="wb-send" style="
            background: linear-gradient(135deg, #3a2408, #c5a55a);
            border: none;
            border-radius: 6px;
            color: #1a1108;
            font-size: 13px;
            font-weight: 700;
            padding: 8px 16px;
            cursor: pointer;
            white-space: nowrap;
            height: 36px;
          ">Build</button>
        </div>
      </div>
      <div style="color:#666666; font-size:10px; text-align:center;">Ctrl+Z undo · Ctrl+Shift+Z redo · Enter to build</div>
    `;

    this.input = this.container.querySelector('textarea')!;
    this.responseEl = this.container.querySelector('.wb-response')!;
    this.sendBtn = this.container.querySelector('.wb-send')!;
    this.progressContainer = this.container.querySelector('.wb-progress-container')!;
    this.historyLog = this.container.querySelector('.wb-history')!;
    this.fileInput = this.container.querySelector('.wb-file-input')!;
    this.attachmentPreview = this.container.querySelector('.wb-attachment-preview')!;

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

    const attachBtn = this.container.querySelector('.wb-attach') as HTMLButtonElement;
    attachBtn.addEventListener('click', () => this.fileInput.click());

    this.fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.selectedFile = file;
        this.attachmentPreview.style.display = 'flex';
        this.attachmentPreview.querySelector('span')!.textContent = file.name;
      }
    });

    this.attachmentPreview.querySelector('.wb-remove-attachment')!.addEventListener('click', () => {
      this.selectedFile = null;
      this.fileInput.value = '';
      this.attachmentPreview.style.display = 'none';
    });

    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('keypress', (e) => e.stopPropagation());
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text && !this.selectedFile) return;
    
    this.addToHistory(text || 'Image upload');
    this.input.value = '';
    this.setResponse('The World Spirit considers your request...');
    this.sendBtn.disabled = true;
    
    this.onSubmit(text, this.selectedFile || undefined);
    
    // Clear attachment
    this.selectedFile = null;
    this.fileInput.value = '';
    this.attachmentPreview.style.display = 'none';
  }

  public setResponse(text: string): void {
    this.responseEl.textContent = text;
    this.responseEl.style.display = 'block';
  }

  public setReady(): void {
    this.sendBtn.disabled = false;
  }

  public addToHistory(action: string): void {
    this.historyLog.style.display = 'block';
    const entry = document.createElement('div');
    entry.textContent = `> ${action}`;
    entry.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
    entry.style.padding = '2px 0';
    this.historyLog.prepend(entry);
  }

  // ── Streaming UI ──────────────────────────────────────────────────

  public startStreaming(blueprintId: string, totalChunks: number): void {
    this.streamingBlueprints.set(blueprintId, { total: totalChunks, received: 0 });
    this.progressContainer.style.display = 'flex';
    this.updateProgressBar(blueprintId);
  }

  public updateStreaming(blueprintId: string, _chunkIndex: number, _data: string): void {
    const stream = this.streamingBlueprints.get(blueprintId);
    if (stream) {
      stream.received++;
      this.updateProgressBar(blueprintId);
    }
  }

  public endStreaming(blueprintId: string): void {
    this.streamingBlueprints.delete(blueprintId);
    setTimeout(() => {
      if (this.streamingBlueprints.size === 0) {
        this.progressContainer.style.display = 'none';
      }
    }, 1000);
  }

  private updateProgressBar(blueprintId: string): void {
    const stream = this.streamingBlueprints.get(blueprintId);
    if (!stream) return;

    const percent = Math.round((stream.received / stream.total) * 100);
    const bar = this.progressContainer.querySelector('.wb-progress-bar') as HTMLElement;
    const text = this.progressContainer.querySelector('.wb-progress-text') as HTMLElement;
    
    bar.style.width = `${percent}%`;
    text.textContent = `${percent}%`;
  }

  protected override onShow(): void {
    this.container.style.display = 'flex';
    setTimeout(() => this.input.focus(), 50);
  }

  get visible(): boolean {
    return this.isVisible;
  }
}
