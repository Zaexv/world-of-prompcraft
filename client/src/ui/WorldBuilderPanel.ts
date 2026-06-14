import { UIComponent } from "./core/UIComponent";

export interface PlacedSummary {
  id: string;
  type: string;
  label: string;
}

/** An archetype option for the NPC designer dropdown (from /npc/archetypes). */
export interface ArchetypeInfo {
  key: string;
  allowed_tools: string[];
  hostile?: boolean;
}

export interface WorldBuilderPanelOptions {
  /** All registered mesh type ids, for the palette browser. */
  catalog?: string[];
  /** Spawn a catalog mesh at the player (manual, syncs online). */
  onPaletteSpawn?: (type: string) => void;
  /** Remove a placed object by id (manual, syncs online). */
  onDelete?: (id: string) => void;
  /** Current placed objects, for the list. */
  getPlaced?: () => PlacedSummary[];
  /** Send a chat-driven NPC creation request (NPC tab). */
  onNpcDesign?: (prompt: string, archetype?: string) => void;
  /** Archetypes for the NPC dropdown (fetched from the server). */
  npcArchetypes?: ArchetypeInfo[];
}

/**
 * World Builder Panel — allows the player to type natural language commands
 * to modify the game world via the WorldBuilder agent, browse the mesh catalog,
 * and manage what they've placed.
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
  declare private paletteSection: HTMLElement;
  declare private paletteList: HTMLElement;
  declare private paletteSearch: HTMLInputElement;
  declare private placedSection: HTMLElement;
  declare private placedList: HTMLElement;
  declare private npcSection: HTMLElement;
  declare private archSelect: HTMLSelectElement;
  declare private archTools: HTMLElement;

  private selectedFile: File | null = null;
  private streamingBlueprints: Map<string, { total: number, received: number }> = new Map();
  private npcMode = false;

  private readonly catalog: string[];
  private readonly onPaletteSpawn?: (type: string) => void;
  private readonly onDelete?: (id: string) => void;
  private readonly getPlaced?: () => PlacedSummary[];
  private readonly onNpcDesign?: (prompt: string, archetype?: string) => void;
  private npcArchetypes: ArchetypeInfo[];

  onSubmit: (prompt: string, attachment?: File) => void;
  onUndo: () => void;
  onRedo: () => void;

  constructor(
    onSubmit: (prompt: string, attachment?: File) => void,
    onUndo: () => void,
    onRedo: () => void,
    options: WorldBuilderPanelOptions = {}
  ) {
    super('game-ui', 'world-builder-panel');
    this.onSubmit = onSubmit;
    this.onUndo = onUndo;
    this.onRedo = onRedo;
    this.catalog = (options.catalog ?? []).slice().sort();
    this.onPaletteSpawn = options.onPaletteSpawn;
    this.onDelete = options.onDelete;
    this.getPlaced = options.getPlaced;
    this.onNpcDesign = options.onNpcDesign;
    this.npcArchetypes = options.npcArchetypes ?? [];

    this.setupShortcuts();
    // render() already ran inside super() with catalog/archetypes undefined —
    // repaint now that the real values are assigned.
    this.renderPalette();
    this.renderArchetypes();
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
      width: "540px",
      maxHeight: "70vh",
      background: "rgba(10, 8, 20, 0.95)",
      border: "1px solid rgba(197, 165, 90, 0.4)",
      borderRadius: "8px",
      padding: "16px",
      boxShadow: "0 4px 32px rgba(0, 0, 0, 0.6), 0 0 12px rgba(197, 165, 90, 0.1)",
      backdropFilter: "blur(8px)",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      zIndex: "1200",
      display: "none",
      flexDirection: "column",
      gap: "10px",
      overflowY: "auto",
      // The #game-ui root is pointer-events:none so the 3D canvas gets clicks;
      // panels must opt back in or their controls aren't clickable.
      pointerEvents: "auto"
    } as CSSStyleDeclaration);

    this.container.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:10px; height:10px; border-radius:50%; background:#c5a55a; box-shadow:0 0 6px rgba(197,165,90,0.8);"></div>
        <span style="color:#e8dcc8; font-size:13px; font-weight:600; letter-spacing:0.5px;">WORLD SPIRIT</span>
        <span style="color:#aaaaaa; font-size:11px; margin-left:4px;">— shape the world with words</span>
        <button class="wb-close" style="margin-left:auto; background:none; border:none; color:#c5a55a; cursor:pointer; font-size:18px; line-height:1;">×</button>
      </div>

      <div class="wb-tabs" style="display:flex; gap:6px;">
        <button class="wb-tab wb-tab-palette" style="${this.tabStyle()}">📦 Catalog</button>
        <button class="wb-tab wb-tab-placed" style="${this.tabStyle()}">🗺️ Placed</button>
        <button class="wb-tab wb-tab-npc" style="${this.tabStyle()}">🧙 NPC</button>
      </div>

      <div class="wb-npc" style="display:none; flex-direction:column; gap:6px;">
        <label style="color:#aaa; font-size:11px;">Archetype (sets what the NPC can do)</label>
        <select class="wb-arch" style="
          width:100%; box-sizing:border-box; background:rgba(10,8,20,0.8);
          border:1px solid rgba(197,165,90,0.3); border-radius:6px; color:#e8dcc8;
          font-size:12px; padding:6px 8px; outline:none; font-family:inherit;
        "></select>
        <div class="wb-arch-tools" style="color:#8a7; font-size:10px; min-height:12px;"></div>
      </div>

      <div class="wb-palette" style="display:none; flex-direction:column; gap:6px;">
        <input class="wb-palette-search" placeholder="Search mesh types..." style="
          width:100%; box-sizing:border-box; background:rgba(10,8,20,0.8);
          border:1px solid rgba(197,165,90,0.3); border-radius:6px; color:#e8dcc8;
          font-size:12px; padding:6px 8px; outline:none; font-family:inherit;
        ">
        <div class="wb-palette-list" style="
          display:flex; flex-wrap:wrap; gap:4px; max-height:140px; overflow-y:auto;
          padding:2px;
        "></div>
      </div>

      <div class="wb-placed" style="display:none; flex-direction:column; gap:4px;">
        <div class="wb-placed-list" style="
          max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:3px;
        "></div>
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
            placeholder="Describe what you want to build or change..."
            rows="3"
            style="
              width: 100%;
              box-sizing: border-box;
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
    this.paletteSection = this.container.querySelector('.wb-palette')!;
    this.paletteList = this.container.querySelector('.wb-palette-list')!;
    this.paletteSearch = this.container.querySelector('.wb-palette-search')!;
    this.placedSection = this.container.querySelector('.wb-placed')!;
    this.placedList = this.container.querySelector('.wb-placed-list')!;
    this.npcSection = this.container.querySelector('.wb-npc')!;
    this.archSelect = this.container.querySelector('.wb-arch')!;
    this.archTools = this.container.querySelector('.wb-arch-tools')!;

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

    // Tabs toggle the catalog / placed sections.
    const paletteTab = this.container.querySelector('.wb-tab-palette') as HTMLButtonElement;
    const placedTab = this.container.querySelector('.wb-tab-placed') as HTMLButtonElement;
    paletteTab.addEventListener('click', () => this.toggleSection('palette'));
    placedTab.addEventListener('click', () => this.toggleSection('placed'));
    const npcTab = this.container.querySelector('.wb-tab-npc') as HTMLButtonElement;
    npcTab.addEventListener('click', () => this.toggleSection('npc'));
    this.archSelect.addEventListener('change', () => this.updateArchToolsHint());
    this.archSelect.addEventListener('keydown', (e) => e.stopPropagation());
    this.renderArchetypes();

    this.paletteSearch.addEventListener('keydown', (e) => e.stopPropagation());
    this.paletteSearch.addEventListener('input', () => this.renderPalette());

    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('keypress', (e) => e.stopPropagation());

    this.renderPalette();
  }

  private tabStyle(): string {
    return `flex:1; background:rgba(197,165,90,0.12); border:1px solid rgba(197,165,90,0.3);
      border-radius:6px; color:#c5a55a; font-size:11px; font-family:inherit; padding:5px 8px;
      cursor:pointer;`;
  }

  private toggleSection(which: 'palette' | 'placed' | 'npc'): void {
    const sections: Record<'palette' | 'placed' | 'npc', HTMLElement> = {
      palette: this.paletteSection,
      placed: this.placedSection,
      npc: this.npcSection,
    };
    const target = sections[which];
    for (const [k, el] of Object.entries(sections)) {
      if (k !== which) el.style.display = 'none';
    }
    const show = target.style.display === 'none';
    target.style.display = show ? 'flex' : 'none';
    // NPC mode is active whenever the NPC section is the one shown.
    this.npcMode = which === 'npc' && show;
    this.input.placeholder = this.npcMode
      ? 'Describe an NPC to create (e.g. a grumpy blacksmith)...'
      : 'Describe what you want to build or change...';
    this.setReady();
    if (show && which === 'placed') this.refreshPlaced();
    if (show && which === 'palette') setTimeout(() => this.paletteSearch.focus(), 30);
  }

  // ── Palette browser ───────────────────────────────────────────────

  private renderPalette(): void {
    // `render()` runs inside super() before the subclass sets `this.catalog`,
    // so tolerate it being undefined on the first pass.
    const cat = this.catalog ?? [];
    if (!this.paletteSearch) return;
    const q = this.paletteSearch.value.trim().toLowerCase();
    const matches = (q ? cat.filter((t) => t.includes(q)) : cat).slice(0, 200);
    this.paletteList.innerHTML = '';
    if (matches.length === 0) {
      this.paletteList.innerHTML = `<span style="color:#888; font-size:11px;">No matching mesh types.</span>`;
      return;
    }
    for (const type of matches) {
      const btn = document.createElement('button');
      btn.textContent = type;
      btn.title = `Place ${type} at your location`;
      Object.assign(btn.style, {
        background: 'rgba(197,165,90,0.1)',
        border: '1px solid rgba(197,165,90,0.25)',
        borderRadius: '4px',
        color: '#e8dcc8',
        fontSize: '10px',
        fontFamily: 'inherit',
        padding: '3px 6px',
        cursor: 'pointer',
      } as CSSStyleDeclaration);
      btn.addEventListener('click', () => {
        this.onPaletteSpawn?.(type);
        this.addToHistory(`Place ${type}`);
      });
      this.paletteList.appendChild(btn);
    }
  }

  // ── Placed-objects list ───────────────────────────────────────────

  public refreshPlaced(): void {
    if (!this.getPlaced) return;
    const placed = this.getPlaced();
    this.placedList.innerHTML = '';
    if (placed.length === 0) {
      this.placedList.innerHTML = `<span style="color:#888; font-size:11px;">Nothing placed yet.</span>`;
      return;
    }
    for (const obj of placed) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(0,0,0,0.25)', borderRadius: '4px', padding: '3px 6px',
      } as CSSStyleDeclaration);

      const name = document.createElement('span');
      name.textContent = obj.label || obj.type;
      Object.assign(name.style, {
        flex: '1', color: '#e8dcc8', fontSize: '11px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      } as CSSStyleDeclaration);

      const typeTag = document.createElement('span');
      typeTag.textContent = obj.type;
      Object.assign(typeTag.style, { color: '#888', fontSize: '9px' } as CSSStyleDeclaration);

      const del = document.createElement('button');
      del.textContent = '🗑';
      del.title = 'Delete (syncs to all players)';
      Object.assign(del.style, {
        background: 'none', border: 'none', color: '#ff6666',
        cursor: 'pointer', fontSize: '12px',
      } as CSSStyleDeclaration);
      del.addEventListener('click', () => {
        this.onDelete?.(obj.id);
        this.addToHistory(`Delete ${obj.label || obj.type}`);
        // Optimistic removal; the synced update will reconcile.
        row.remove();
      });

      row.appendChild(name);
      row.appendChild(typeTag);
      row.appendChild(del);
      this.placedList.appendChild(row);
    }
  }

  private submit(): void {
    const text = this.input.value.trim();

    if (this.npcMode) {
      if (!text) return;
      this.addToHistory(text);
      this.input.value = '';
      this.setResponse('The Architect breathes life into your words...');
      this.sendBtn.disabled = true;
      this.sendBtn.textContent = '…';
      this.onNpcDesign?.(text, this.archSelect.value || undefined);
      return;
    }

    if (!text && !this.selectedFile) return;

    this.addToHistory(text || 'Image upload');
    this.input.value = '';
    this.setResponse('The World Spirit considers your request...');
    this.sendBtn.disabled = true;
    this.sendBtn.textContent = '…';

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
    this.sendBtn.textContent = this.npcMode ? 'Create NPC' : 'Build';
  }

  /** Replace the archetype dropdown options (e.g. after fetching from server). */
  public setArchetypes(list: ArchetypeInfo[]): void {
    this.npcArchetypes = list;
    this.renderArchetypes();
  }

  private renderArchetypes(): void {
    // render() runs inside super() before the subclass assigns npcArchetypes.
    const list = this.npcArchetypes ?? [];
    if (!this.archSelect) return;
    this.archSelect.innerHTML = '';
    for (const a of list) {
      const opt = document.createElement('option');
      opt.value = a.key;
      opt.textContent = a.hostile ? `${a.key} (hostile)` : a.key;
      this.archSelect.appendChild(opt);
    }
    this.updateArchToolsHint();
  }

  private updateArchToolsHint(): void {
    if (!this.archTools) return;
    const sel = (this.npcArchetypes ?? []).find((a) => a.key === this.archSelect.value);
    this.archTools.textContent = sel ? `can use: ${sel.allowed_tools.join(', ')}` : '';
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
    this.refreshPlaced();
    setTimeout(() => this.input.focus(), 50);
  }

  get visible(): boolean {
    return this.isVisible;
  }
}
