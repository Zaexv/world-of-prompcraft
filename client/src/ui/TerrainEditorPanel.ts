/* eslint-disable @typescript-eslint/no-explicit-any */
import { UIComponent } from "./core/UIComponent";
import { TerrainEditor, EditorMode } from "../debug/TerrainEditor";
import { meshTypes } from "../meshes/index";
import { GROUND_TYPES } from "../scene/Terrain";

/** Selectable NPC skins (mirrors NPCPlaceholderStyle). */
const NPC_SKINS = [
  'civilian', 'merchant', 'guard', 'healer', 'sage', 'mage', 'pyromancer',
  'cryomancer', 'dragon', 'monster', 'spider', 'wasp', 'wolf', 'golem',
  'boar', 'orc', 'undead', 'oracle',
];

/**
 * Terrain Editor Panel — manual 3D interface for sculpting terrain and placing buildings.
 */
export class TerrainEditorPanel extends UIComponent {
  private editor: TerrainEditor;
  
  constructor(editor: TerrainEditor) {
    super('game-ui', 'terrain-editor-panel');
    this.editor = editor;
    
    // Now that editor is assigned, we can wire everything up
    this.setupListeners();
    this.updateAssetList();
  }

  public showLoading(message: string): void {
    this.container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; height:100px; color:#c5a55a;">
        <span style="font-size:14px; font-weight:700;">${message.toUpperCase()}</span>
      </div>
    `;
    this.show();
  }

  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      top: "20px",
      right: "20px",
      width: "280px",
      maxHeight: "90vh",
      overflowY: "auto",
      background: "rgba(10, 8, 20, 0.95)",
      border: "1px solid rgba(197, 165, 90, 0.4)",
      borderRadius: "8px",
      padding: "16px",
      boxShadow: "0 4px 32px rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(8px)",
      fontFamily: "'Cinzel', serif",
      zIndex: "1500",
      display: "none",
      flexDirection: "column",
      gap: "12px",
      color: "#e8dcc8"
    } as CSSStyleDeclaration);

    this.container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; background:rgba(10, 8, 20, 1); padding-bottom:8px; z-index:10;">
        <span style="font-weight:700; font-size:14px; color:#c5a55a;">WORLD BUILDER</span>
        <button class="te-close" style="background:none; border:none; color:#c5a55a; cursor:pointer; font-size:18px;">×</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <span style="font-size:11px; color:#aaaaaa; text-transform:uppercase; letter-spacing:1px;">Editor Mode</span>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <button class="te-mode" data-mode="off" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">SELECT</button>
          <button class="te-mode" data-mode="move" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">MOVE</button>
          <button class="te-mode" data-mode="raise" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">RAISE</button>
          <button class="te-mode" data-mode="lower" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">LOWER</button>
          <button class="te-mode" data-mode="place" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">PLACE OBJ</button>
          <button class="te-mode" data-mode="npc" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">PLACE NPC</button>
          <button class="te-mode" data-mode="remove" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">REMOVE</button>
          <button class="te-mode" data-mode="flatten" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">FLATTEN</button>
          <button class="te-mode" data-mode="paint" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">PAINT GROUND</button>
          <button class="te-mode" data-mode="erase" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">ERASE TERRAIN</button>
          <button class="te-mode" data-mode="water" style="padding:6px; font-size:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer;">WATER</button>
          </div>
      </div>

      <div class="te-properties-section" style="display:none; flex-direction:column; gap:8px;">
        <span style="font-size:11px; color:#aaaaaa; text-transform:uppercase; letter-spacing:1px;">Object Properties</span>
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px;">
          <span>Scale</span>
          <input type="number" class="te-prop-scale" step="0.1" value="1.0" style="width:60px; background:#1a1108; color:#e8dcc8; border:1px solid #333;">
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px;">
          <span>Rot Y (deg)</span>
          <input type="number" class="te-prop-rot-y" step="15" value="0" style="width:60px; background:#1a1108; color:#e8dcc8; border:1px solid #333;">
        </div>
        <div class="te-prop-path-width-row" style="display:flex; align-items:center; justify-content:space-between; font-size:12px;">
          <span>Path Width</span>
          <input type="number" class="te-prop-path-width" step="1" value="10" style="width:60px; background:#1a1108; color:#e8dcc8; border:1px solid #333;">
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <span style="font-size:11px; color:#aaaaaa; text-transform:uppercase; letter-spacing:1px;">Layers</span>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
            <input type="checkbox" class="te-layer" data-layer="buildings" checked> Buildings
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
            <input type="checkbox" class="te-layer" data-layer="npcs" checked> NPCs
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
            <input type="checkbox" class="te-layer" data-layer="features" checked> Features
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
            <input type="checkbox" class="te-layer" data-layer="paths" checked> Paths
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
            <input type="checkbox" class="te-layer" data-layer="sculpt" checked> Sculpt Edits
          </label>
        </div>
      </div>

      <div class="te-sculpt-settings" style="display:flex; flex-direction:column; gap:8px;">
        <span style="font-size:11px; color:#aaaaaa; text-transform:uppercase; letter-spacing:1px;">Brush Settings</span>
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px;">
          <span>Radius</span>
          <input type="range" class="te-radius" min="5" max="50" value="15" style="width:120px;">
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px;">
          <span>Intensity</span>
          <input type="range" class="te-intensity" min="1" max="20" value="5" style="width:120px;">
        </div>
      </div>

      <div class="te-palette-section" style="display:none; flex-direction:column; gap:8px;">
        <span style="font-size:11px; color:#aaaaaa; text-transform:uppercase; letter-spacing:1px;">Asset Palette</span>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <span style="font-size:10px; color:#888;">Category</span>
          <select class="te-category-select" style="background:#1a1108; color:#e8dcc8; border:1px solid rgba(197,165,90,0.4); padding:4px; font-family:inherit; font-size:11px;">
            <option value="building">Buildings</option>
            <option value="vegetation">Vegetation</option>
            <option value="prop">Props</option>
            <option value="encounter">Encounters</option>
            <option value="npc">NPCs</option>
          </select>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <span style="font-size:10px; color:#888;">Type</span>
          <select class="te-asset-select" style="background:#1a1108; color:#e8dcc8; border:1px solid rgba(197,165,90,0.4); padding:4px; font-family:inherit; font-size:11px;">
            <!-- Dynamically populated -->
          </select>
        </div>
      </div>

      <div class="te-npc-section" style="display:none; flex-direction:column; gap:6px;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="te-npc-header" style="font-size:11px; color:#c5a55a; text-transform:uppercase; letter-spacing:1px;">New NPC</span>
          <button class="te-npc-new" style="display:none; background:none; border:1px solid rgba(197,165,90,0.4); color:#c5a55a; cursor:pointer; font-size:10px; padding:2px 6px;">+ New</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:3px;">
          <span style="font-size:10px; color:#888;">Name</span>
          <input class="te-npc-name" placeholder="e.g. Greta the Smith" style="background:#1a1108; color:#e8dcc8; border:1px solid rgba(197,165,90,0.4); padding:4px; font-family:inherit; font-size:11px;">
        </div>
        <div style="display:flex; flex-direction:column; gap:3px;">
          <span style="font-size:10px; color:#888;">Archetype (sets allowed tools)</span>
          <select class="te-npc-arch" style="background:#1a1108; color:#e8dcc8; border:1px solid rgba(197,165,90,0.4); padding:4px; font-family:inherit; font-size:11px;"></select>
          <span class="te-npc-arch-tools" style="font-size:9px; color:#8a7; min-height:11px;"></span>
        </div>
        <div style="display:flex; flex-direction:column; gap:3px;">
          <span style="font-size:10px; color:#888;">Skin</span>
          <select class="te-npc-skin" style="background:#1a1108; color:#e8dcc8; border:1px solid rgba(197,165,90,0.4); padding:4px; font-family:inherit; font-size:11px;"></select>
        </div>
        <div style="display:flex; flex-direction:column; gap:3px;">
          <span style="font-size:10px; color:#888;">Personality / voice</span>
          <textarea class="te-npc-flavor" rows="3" placeholder="Who they are and how they speak (no tool rules — the archetype handles those)." style="background:#1a1108; color:#e8dcc8; border:1px solid rgba(197,165,90,0.4); padding:4px; font-family:inherit; font-size:11px; resize:vertical;"></textarea>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px;">
          <span>Max HP (0 = archetype default)</span>
          <input type="number" class="te-npc-hp" min="0" step="10" value="0" style="width:60px; background:#1a1108; color:#e8dcc8; border:1px solid #333;">
        </div>
        <span class="te-npc-hint" style="font-size:9px; color:#666;">Click the ground to place this NPC.</span>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px;">
          <span style="font-size:10px; color:#888;">Existing NPCs (click to edit)</span>
          <button class="te-npc-refresh" style="background:none; border:none; color:#c5a55a; cursor:pointer; font-size:11px;">↻</button>
        </div>
        <div class="te-npc-list" style="max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:2px; font-size:11px;"></div>
      </div>

      <div class="te-ground-section" style="display:none; flex-direction:column; gap:4px;">
        <span style="font-size:11px; color:#aaaaaa; text-transform:uppercase; letter-spacing:1px;">Ground Type</span>
        <select class="te-ground-select" style="background:#1a1108; color:#e8dcc8; border:1px solid rgba(197,165,90,0.4); padding:4px; font-family:inherit; font-size:11px;"></select>
        <span style="font-size:10px; color:#666;">Press 6 to search ground types</span>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-top:8px;">
        <button class="te-refresh" style="padding:8px; background:rgba(197,165,90,0.15); border:1px solid rgba(197,165,90,0.3); color:#c5a55a; cursor:pointer; font-family:inherit; font-size:11px;">REFRESH VIEW</button>
        <button class="te-save" style="padding:8px; background:linear-gradient(135deg, #3a2408, #c5a55a); border:none; border-radius:4px; color:#1a1108; font-weight:700; cursor:pointer; font-family:inherit; font-size:11px;">SAVE MANIFEST</button>
      </div>
      <div style="font-size:10px; color:#666; text-align:center;">Updates shared/data/world_manifest.json</div>
    `;

    // Because super() calls render() before this.editor is set, 
    // we only re-attach listeners if the editor is available.
    if (this.editor) {
      this.setupListeners();
      this.updateAssetList();
    }
  }

  private setupListeners(): void {
    const closeBtn = this.container.querySelector('.te-close')!;
    closeBtn.addEventListener('click', () => this.hide());

    const modeBtns = this.container.querySelectorAll('.te-mode');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => (b as HTMLElement).style.background = 'rgba(255,255,255,0.05)');
        (btn as HTMLElement).style.background = 'rgba(197,165,90,0.3)';
        
        const mode = btn.getAttribute('data-mode');
        const paletteSection = this.container.querySelector('.te-palette-section') as HTMLElement;
        const sculptSettings = this.container.querySelector('.te-sculpt-settings') as HTMLElement;
        const groundSection = this.container.querySelector('.te-ground-section') as HTMLElement;
        const npcSection = this.container.querySelector('.te-npc-section') as HTMLElement;
        const categorySelect = this.container.querySelector('.te-category-select') as HTMLSelectElement;

        // The asset palette is needed for BOTH object and NPC placement.
        paletteSection.style.display = (mode === 'place' || mode === 'npc') ? 'flex' : 'none';
        // NPC designer form only when placing NPCs.
        npcSection.style.display = mode === 'npc' ? 'flex' : 'none';
        if (mode === 'npc') this.refreshNpcList();
        // Brush settings drive sculpt AND ground paint.
        sculptSettings.style.display = (mode === 'raise' || mode === 'lower' || mode === 'flatten' || mode === 'paint' || mode === 'erase' || mode === 'water') ? 'flex' : 'none';
        groundSection.style.display = mode === 'paint' ? 'flex' : 'none';

        // Drive the asset category from the mode: NPC placement must list NPC
        // styles (not whatever building was last picked — which produced invalid
        // NPCs like style "pavilion"), and object placement must never use an
        // NPC style. Lock the category dropdown while placing NPCs.
        if (mode === 'npc') {
          if (categorySelect.value !== 'npc') { categorySelect.value = 'npc'; this.updateAssetList(); }
          categorySelect.disabled = true;
        } else {
          categorySelect.disabled = false;
          if (mode === 'place' && categorySelect.value === 'npc') { categorySelect.value = 'building'; this.updateAssetList(); }
        }

        switch (mode) {
          case 'off': this.editor.setMode(EditorMode.OFF); break;
          case 'move': this.editor.setMode(EditorMode.MOVE_OBJECT); break;
          case 'raise': this.editor.setMode(EditorMode.SCULPT_RAISE); break;
          case 'lower': this.editor.setMode(EditorMode.SCULPT_LOWER); break;
          case 'flatten': this.editor.setMode(EditorMode.SCULPT_FLATTEN); break;
          case 'place': this.editor.setMode(EditorMode.PLACE_OBJECT); break;
          case 'remove': this.editor.setMode(EditorMode.REMOVE_OBJECT); break;
          case 'npc': this.editor.setMode(EditorMode.PLACE_NPC); break;
          case 'path': this.editor.setMode(EditorMode.PLACE_PATH); break;
          case 'paint': this.editor.setMode(EditorMode.PAINT_GROUND); break;
          case 'erase': this.editor.setMode(EditorMode.ERASE_TERRAIN); break;
          case 'water': this.editor.setMode(EditorMode.WATER); break;
        }
      });
    });

    const scaleInput = this.container.querySelector('.te-prop-scale') as HTMLInputElement;
    const rotYInput = this.container.querySelector('.te-prop-rot-y') as HTMLInputElement;
    const pathWidthInput = this.container.querySelector('.te-prop-path-width') as HTMLInputElement;
    const propertiesSection = this.container.querySelector('.te-properties-section') as HTMLElement;
    const pathWidthRow = this.container.querySelector('.te-prop-path-width-row') as HTMLElement;

    const updateSelected = () => {
      this.editor.updateSelectedObject({
        scale: parseFloat(scaleInput.value),
        rotation: [0, parseFloat(rotYInput.value) * (Math.PI / 180), 0],
        pathWidth: parseFloat(pathWidthInput.value)
      });
    };

    scaleInput.addEventListener('input', updateSelected);
    rotYInput.addEventListener('input', updateSelected);
    pathWidthInput.addEventListener('input', updateSelected);

    // Save state when user finishes adjusting the value
    const saveState = () => this.editor.saveState();
    scaleInput.addEventListener('change', saveState);
    rotYInput.addEventListener('change', saveState);
    pathWidthInput.addEventListener('change', saveState);

    window.addEventListener('editor:select', (e: any) => {
      const selected = e.detail;
      if (selected) {
        propertiesSection.style.display = 'flex';
        pathWidthRow.style.display = selected.type === 'path' ? 'flex' : 'none';
        scaleInput.parentElement!.style.display = selected.type === 'path' ? 'none' : 'flex';
        rotYInput.parentElement!.style.display = selected.type === 'path' ? 'none' : 'flex';
        
        if (selected.type === 'path') {
          const idx = parseInt(selected.id.split('_')[1]);
          pathWidthInput.value = (this.editor['worldManifest'].getPaths()[idx].width).toString();
        } else {
          scaleInput.value = (selected.group.scale.x).toString();
          rotYInput.value = (selected.group.rotation.y * (180 / Math.PI)).toFixed(0);
        }
      } else {
        propertiesSection.style.display = 'none';
      }
    });

    const radiusInput = this.container.querySelector('.te-radius') as HTMLInputElement;
    radiusInput.addEventListener('input', () => {
      this.editor.setBrushRadius(parseInt(radiusInput.value));
    });

    const intensityInput = this.container.querySelector('.te-intensity') as HTMLInputElement;
    intensityInput.addEventListener('input', () => {
      this.editor.setBrushIntensity(parseInt(intensityInput.value));
    });

    const categorySelect = this.container.querySelector('.te-category-select') as HTMLSelectElement;
    categorySelect.addEventListener('change', () => {
      this.updateAssetList();
    });

    const assetSelect = this.container.querySelector('.te-asset-select') as HTMLSelectElement;
    assetSelect.addEventListener('change', () => {
      this.editor.setSelectedAsset(assetSelect.value, categorySelect.value);
    });

    const groundSelect = this.container.querySelector('.te-ground-select') as HTMLSelectElement;
    groundSelect.innerHTML = Object.keys(GROUND_TYPES)
      .map(t => `<option value="${t}">${t}</option>`).join('');
    groundSelect.addEventListener('change', () => this.editor.setSelectedGroundType(groundSelect.value));

    this.setupNpcDesigner();

    const layerChecks = this.container.querySelectorAll('.te-layer');
    layerChecks.forEach(check => {
      check.addEventListener('change', (e) => {
        const layer = (e.target as HTMLInputElement).getAttribute('data-layer')!;
        const visible = (e.target as HTMLInputElement).checked;
        this.editor.setLayerVisibility(layer, visible);
      });
    });

    const saveBtn = this.container.querySelector('.te-save')!;
    saveBtn.addEventListener('click', () => {
      const fixes = this.editor.saveManifest();
      saveBtn.textContent = fixes.length > 0 ? `SAVED — FIXED: ${fixes.join(', ')}` : 'SAVING...';
      setTimeout(() => saveBtn.textContent = 'SAVE MANIFEST', fixes.length > 0 ? 2500 : 1000);
    });

    const refreshBtn = this.container.querySelector('.te-refresh')!;
    refreshBtn.addEventListener('click', () => {
      this.editor.refreshVisualization();
    });
  }

  private npcArchetypes: Array<{ key: string; allowed_tools: string[]; hostile?: boolean }> = [];

  /** Wire the NPC designer form: archetype + skin dropdowns, field sync, edit list. */
  private setupNpcDesigner(): void {
    const nameInput = this.container.querySelector('.te-npc-name') as HTMLInputElement;
    const archSelect = this.container.querySelector('.te-npc-arch') as HTMLSelectElement;
    const archTools = this.container.querySelector('.te-npc-arch-tools') as HTMLElement;
    const skinSelect = this.container.querySelector('.te-npc-skin') as HTMLSelectElement;
    const flavorInput = this.container.querySelector('.te-npc-flavor') as HTMLTextAreaElement;
    const hpInput = this.container.querySelector('.te-npc-hp') as HTMLInputElement;
    const newBtn = this.container.querySelector('.te-npc-new') as HTMLButtonElement;
    const refreshBtn = this.container.querySelector('.te-npc-refresh') as HTMLButtonElement;
    if (!nameInput || !archSelect || !skinSelect) return;

    skinSelect.innerHTML = NPC_SKINS.map((s) => `<option value="${s}">${s}</option>`).join('');

    const updateToolsHint = () => {
      const sel = this.npcArchetypes.find((a) => a.key === archSelect.value);
      archTools.textContent = sel ? `can use: ${sel.allowed_tools.join(', ')}` : '';
    };
    const sync = () => this.editor.setNpcDesign({
      name: nameInput.value,
      archetype: archSelect.value,
      flavorPrompt: flavorInput.value,
      hp: parseInt(hpInput.value) || 0,
      skin: skinSelect.value,
    });

    nameInput.addEventListener('input', sync);
    flavorInput.addEventListener('input', sync);
    hpInput.addEventListener('input', sync);
    archSelect.addEventListener('change', () => { updateToolsHint(); sync(); });
    skinSelect.addEventListener('change', sync);

    newBtn.addEventListener('click', () => this.startNewNpc());
    refreshBtn.addEventListener('click', () => this.refreshNpcList());

    void fetch('/npc/archetypes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.archetypes) return;
        this.npcArchetypes = d.archetypes;
        archSelect.innerHTML = this.npcArchetypes
          .map((a) => `<option value="${a.key}">${a.hostile ? `${a.key} (hostile)` : a.key}</option>`)
          .join('');
        updateToolsHint();
        sync();
      })
      .catch(() => { /* dropdown stays empty; placement still works with role fallback */ });
  }

  /** Reset the form to "new NPC" placement mode. */
  private startNewNpc(): void {
    this.editor.clearNpcEdit();
    (this.container.querySelector('.te-npc-name') as HTMLInputElement).value = '';
    (this.container.querySelector('.te-npc-flavor') as HTMLTextAreaElement).value = '';
    (this.container.querySelector('.te-npc-hp') as HTMLInputElement).value = '0';
    (this.container.querySelector('.te-npc-header') as HTMLElement).textContent = 'New NPC';
    (this.container.querySelector('.te-npc-new') as HTMLElement).style.display = 'none';
    (this.container.querySelector('.te-npc-hint') as HTMLElement).textContent = 'Click the ground to place this NPC.';
    this.editor.setNpcDesign({ name: '', flavorPrompt: '', hp: 0 });
  }

  /** Load an existing NPC into the form for editing. */
  private loadNpcForEdit(id: string): void {
    const info = this.editor.beginEditNpc(id);
    if (!info) return;
    (this.container.querySelector('.te-npc-name') as HTMLInputElement).value = info.name;
    (this.container.querySelector('.te-npc-arch') as HTMLSelectElement).value = info.archetype;
    (this.container.querySelector('.te-npc-skin') as HTMLSelectElement).value = info.skin;
    (this.container.querySelector('.te-npc-flavor') as HTMLTextAreaElement).value = info.flavorPrompt;
    (this.container.querySelector('.te-npc-hp') as HTMLInputElement).value = String(info.hp);
    const sel = this.npcArchetypes.find((a) => a.key === info.archetype);
    (this.container.querySelector('.te-npc-arch-tools') as HTMLElement).textContent =
      sel ? `can use: ${sel.allowed_tools.join(', ')}` : '';
    (this.container.querySelector('.te-npc-header') as HTMLElement).textContent = `Editing: ${info.name}`;
    (this.container.querySelector('.te-npc-new') as HTMLElement).style.display = 'inline-block';
    (this.container.querySelector('.te-npc-hint') as HTMLElement).textContent = 'Edits apply live. Click ground to place a NEW NPC.';
  }

  /** Repaint the existing-NPCs list from the manifest. */
  private refreshNpcList(): void {
    const list = this.container.querySelector('.te-npc-list') as HTMLElement;
    if (!list) return;
    const npcs = this.editor.getNpcList().sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = '';
    if (npcs.length === 0) {
      list.innerHTML = `<span style="color:#888;">No NPCs in manifest.</span>`;
      return;
    }
    for (const n of npcs) {
      const row = document.createElement('button');
      row.textContent = `${n.name} · ${n.archetype || '—'} · ${n.skin || '—'}`;
      row.title = n.id;
      row.style.cssText = 'text-align:left; background:rgba(197,165,90,0.08); border:1px solid rgba(197,165,90,0.2); color:#e8dcc8; cursor:pointer; font-family:inherit; font-size:10px; padding:3px 5px;';
      row.addEventListener('click', () => this.loadNpcForEdit(n.id));
      list.appendChild(row);
    }
  }

  private updateAssetList(): void {
    const categorySelect = this.container.querySelector('.te-category-select') as HTMLSelectElement;
    const assetSelect = this.container.querySelector('.te-asset-select') as HTMLSelectElement;
    const category = categorySelect.value as any;

    let types: string[] = [];
    if (category === 'npc') {
      types = [...NPC_SKINS];
    } else if (category === 'encounter') {
      // Encounter structures (campsite, bandit camp, …) are registered as 'prop'
      // meshes with an `encounter_` prefix — there is no 'encounter' MeshCategory,
      // so surface them by prefix instead (meshTypes('encounter') returns []).
      types = meshTypes().filter(t => t.startsWith('encounter_')).sort();
    } else {
      types = meshTypes(category).sort();
    }

    assetSelect.innerHTML = types.map(t => `<option value="${t}">${t.replace(/_/g, ' ')}</option>`).join('');
    
    if (types.length > 0) {
      this.editor.setSelectedAsset(types[0], category);
    }
  }

  protected override onShow(): void {
    this.container.style.display = 'flex';
  }

  protected override onHide(): void {
    this.container.style.display = 'none';
    this.editor.setMode(EditorMode.OFF);
  }
}
