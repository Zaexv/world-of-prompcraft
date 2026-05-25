/**
 * Settings Panel — demonstrates UIComponent pattern for future panels.
 *
 * Any new UI panel should extend UIComponent and follow this pattern:
 * 1. Implement render() to build the DOM
 * 2. Override onShow()/onHide()/onDispose() for lifecycle hooks
 * 3. Use container, addClass(), setHTML(), addEventListener() helpers
 * 4. Parent class handles DOM attachment and visibility
 *
 * Usage:
 * ```typescript
 * const settingsPanel = new SettingsPanel('ui-root');
 * settingsPanel.show();  // Component handles display
 * settingsPanel.hide();  // Component handles hiding
 * ```
 */

import { UIComponent } from '../core/UIComponent';
import { createButton } from '../core/UIFactory';

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
}

export class SettingsPanel extends UIComponent {
  private settings: GameSettings;
  private onSaveCallback?: (settings: GameSettings) => void;

  constructor(parentId: string = 'ui-root') {
    super(parentId, 'settings-panel');

    // Default settings
    this.settings = {
      masterVolume: 0.8,
      musicVolume: 0.7,
      sfxVolume: 0.8,
      graphicsQuality: 'high',
    };
  }

  /**
   * Set callback when settings are saved.
   */
  onSave(callback: (settings: GameSettings) => void): void {
    this.onSaveCallback = callback;
  }

  render(): void {
    // Styling
    const style = document.createElement('style');
    style.textContent = `
      .settings-panel {
        padding: 20px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 2px solid #c5a55a;
        border-radius: 8px;
        color: #e0d5c7;
        font-family: 'Arial', sans-serif;
      }
      .settings-panel h2 {
        margin-top: 0;
        color: #c5a55a;
        font-size: 24px;
        text-align: center;
      }
      .settings-group {
        margin: 20px 0;
        padding: 15px;
        background: rgba(0,0,0,0.3);
        border-radius: 4px;
      }
      .settings-group label {
        display: block;
        margin: 10px 0 5px;
        font-weight: bold;
      }
      .settings-group input[type="range"] {
        width: 100%;
        cursor: pointer;
      }
      .settings-group select {
        width: 100%;
        padding: 8px;
        background: #2d3561;
        color: #e0d5c7;
        border: 1px solid #c5a55a;
        border-radius: 4px;
        cursor: pointer;
      }
      .settings-buttons {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin-top: 20px;
      }
      .settings-buttons button {
        padding: 10px 20px;
        background: #c5a55a;
        color: #1a1a2e;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background 0.2s;
      }
      .settings-buttons button:hover {
        background: #d9b876;
      }
      .settings-buttons button.cancel {
        background: #666;
        color: #fff;
      }
      .settings-buttons button.cancel:hover {
        background: #888;
      }
    `;
    if (!document.head.querySelector('style[data-ui-settings]')) {
      style.setAttribute('data-ui-settings', 'true');
      document.head.appendChild(style);
    }

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Game Settings';

    this.container.appendChild(title);

    // Audio Settings
    const audioGroup = document.createElement('div');
    audioGroup.className = 'settings-group';
    audioGroup.innerHTML = `
      <h3 style="margin-top: 0; color: #c5a55a;">Audio</h3>
      <label>Master Volume: <span id="master-vol-display">80</span>%</label>
      <input type="range" id="master-vol" min="0" max="100" value="80">

      <label>Music Volume: <span id="music-vol-display">70</span>%</label>
      <input type="range" id="music-vol" min="0" max="100" value="70">

      <label>SFX Volume: <span id="sfx-vol-display">80</span>%</label>
      <input type="range" id="sfx-vol" min="0" max="100" value="80">
    `;
    this.container.appendChild(audioGroup);

    // Graphics Settings
    const graphicsGroup = document.createElement('div');
    graphicsGroup.className = 'settings-group';
    graphicsGroup.innerHTML = `
      <h3 style="margin-top: 0; color: #c5a55a;">Graphics</h3>
      <label>Quality:</label>
      <select id="graphics-quality">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high" selected>High</option>
      </select>
    `;
    this.container.appendChild(graphicsGroup);

    // Buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'settings-buttons';

    const saveBtn = createButton('Save', () => this.handleSave());
    const cancelBtn = createButton('Cancel', () => this.hide());
    cancelBtn.classList.add('cancel');

    buttonsDiv.appendChild(saveBtn);
    buttonsDiv.appendChild(cancelBtn);
    this.container.appendChild(buttonsDiv);

    // Attach event listeners
    this.addEventListener('change', (e) => this.handleVolumeChange(e));
    this.addEventListener('input', (e) => this.handleVolumeChange(e));
  }

  private handleVolumeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.id === 'master-vol') {
      this.settings.masterVolume = parseInt(target.value) / 100;
      const display = this.container.querySelector('#master-vol-display');
      if (display) display.textContent = target.value;
    } else if (target.id === 'music-vol') {
      this.settings.musicVolume = parseInt(target.value) / 100;
      const display = this.container.querySelector('#music-vol-display');
      if (display) display.textContent = target.value;
    } else if (target.id === 'sfx-vol') {
      this.settings.sfxVolume = parseInt(target.value) / 100;
      const display = this.container.querySelector('#sfx-vol-display');
      if (display) display.textContent = target.value;
    } else if (target.id === 'graphics-quality') {
      this.settings.graphicsQuality = target.value as 'low' | 'medium' | 'high';
    }
  }

  private handleSave(): void {
    this.onSaveCallback?.(this.settings);
    this.hide();
  }

  protected onDispose(): void {
    this.onSaveCallback = undefined;
  }
}

