/**
 * LoginForm — Character creation form component.
 *
 * Encapsulates faction/race/skin selection and username input.
 * Extends UIComponent for consistent lifecycle management.
 */

import { UIComponent } from '../core/UIComponent';
import { getDefaultPlayerSkin, getPlayerSkinOptions } from '../../entities/PlayerSkins';

interface RaceDef {
  id: string;
  label: string;
  color: string;
  faction: 'alliance' | 'horde';
}

const RACES: RaceDef[] = [
  { id: 'human', label: 'Human', color: '#c4a882', faction: 'alliance' },
  { id: 'night_elf', label: 'Night Elf', color: '#8866cc', faction: 'alliance' },
  { id: 'orc', label: 'Orc', color: '#44aa44', faction: 'horde' },
  { id: 'undead', label: 'Undead', color: '#88aaaa', faction: 'horde' },
];

export interface CharacterCreationData {
  username: string;
  race: string;
  faction: 'alliance' | 'horde';
  skin: string;
}

export class LoginForm extends UIComponent {
  onSubmit:
    | ((data: CharacterCreationData) => void)
    | null = null;

  private selectedFaction: 'alliance' | 'horde' = 'alliance';
  private selectedRace: string = 'human';
  private selectedSkin: string = getDefaultPlayerSkin();
  declare private usernameInput: HTMLInputElement;
  declare private errorText: HTMLDivElement;
  declare private submitBtn: HTMLButtonElement;
  declare private raceCardsContainer: HTMLDivElement;
  declare private skinCardsContainer: HTMLDivElement;
  declare private allianceBtn: HTMLButtonElement;
  declare private hordeBtn: HTMLButtonElement;

  constructor(parentId: string = 'login-form-root') {
    super(parentId, 'login-form');
  }

  /**
   * Render the form UI.
   */
  render(): void {
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '1em';
    this.container.style.position = 'relative';
    this.container.style.zIndex = '1';

    // Faction toggle
    const factionRow = document.createElement('div');
    factionRow.style.display = 'flex';
    factionRow.style.gap = '1em';

    this.allianceBtn = this.createFactionButton('ALLIANCE', 'alliance');
    this.hordeBtn = this.createFactionButton('HORDE', 'horde');
    factionRow.appendChild(this.allianceBtn);
    factionRow.appendChild(this.hordeBtn);
    this.container.appendChild(factionRow);

    // Race cards
    this.raceCardsContainer = document.createElement('div');
    this.raceCardsContainer.style.display = 'flex';
    this.raceCardsContainer.style.gap = '1em';
    this.container.appendChild(this.raceCardsContainer);

    this.updateRaceCards();
    this.updateFactionButtons();

    // Skin cards
    this.skinCardsContainer = document.createElement('div');
    this.skinCardsContainer.style.display = 'flex';
    this.skinCardsContainer.style.gap = '1em';
    this.skinCardsContainer.style.flexWrap = 'wrap';
    this.skinCardsContainer.style.justifyContent = 'center';
    this.skinCardsContainer.style.maxWidth = '460px';
    this.container.appendChild(this.skinCardsContainer);
    this.updateSkinCards();

    // Username input
    this.usernameInput = document.createElement('input');
    this.usernameInput.type = 'text';
    this.usernameInput.placeholder = 'Enter your name...';
    this.usernameInput.maxLength = 20;
    Object.assign(this.usernameInput.style, {
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '1rem',
      color: '#c5a55a',
      background: 'rgba(26, 17, 8, 0.9)',
      border: '1px solid #c5a55a',
      borderRadius: '4px',
      padding: '0.5em 1em',
      width: '220px',
      textAlign: 'center',
      outline: 'none',
    } as CSSStyleDeclaration);

    this.usernameInput.addEventListener('input', () => this.validateUsername());
    this.usernameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this.submit();
      }
    });

    this.container.appendChild(this.usernameInput);

    // Error message
    this.errorText = document.createElement('div');
    this.errorText.style.color = '#ff6b6b';
    this.errorText.style.fontSize = '0.9rem';
    this.errorText.style.fontFamily = "'Cinzel', Georgia, serif";
    this.errorText.style.minHeight = '1em';
    this.errorText.style.textAlign = 'center';
    this.container.appendChild(this.errorText);

    // Submit button
    this.submitBtn = document.createElement('button');
    this.submitBtn.textContent = 'ENTER WORLD';
    this.submitBtn.disabled = true;
    Object.assign(this.submitBtn.style, {
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '0.9rem',
      color: '#c5a55a',
      background: 'rgba(26, 17, 8, 0.9)',
      border: '1px solid #c5a55a',
      borderRadius: '4px',
      padding: '0.6em 2em',
      cursor: 'pointer',
      opacity: '0.5',
      transition: 'all 0.3s ease',
    } as CSSStyleDeclaration);

    this.submitBtn.addEventListener('mouseover', () => {
      if (!this.submitBtn.disabled) {
        this.submitBtn.style.background = 'rgba(26, 17, 8, 1)';
        this.submitBtn.style.textShadow = '0 0 8px #c5a55a';
      }
    });

    this.submitBtn.addEventListener('mouseout', () => {
      this.submitBtn.style.textShadow = 'none';
      this.submitBtn.style.background = 'rgba(26, 17, 8, 0.9)';
    });

    this.submitBtn.addEventListener('click', () => this.submit());
    this.container.appendChild(this.submitBtn);
  }

  /**
   * Get current form data.
   */
  getData(): CharacterCreationData {
    return {
      username: this.usernameInput.value.trim(),
      race: this.selectedRace,
      faction: this.selectedFaction,
      skin: this.selectedSkin,
    };
  }

  /**
   * Set error message.
   */
  setError(message: string): void {
    this.errorText.textContent = message;
  }

  /**
   * Clear error message.
   */
  clearError(): void {
    this.errorText.textContent = '';
  }

  /**
   * Validate username and enable/disable submit button.
   */
  private validateUsername(): void {
    const hasName = this.usernameInput.value.trim().length > 0;
    this.submitBtn.disabled = !hasName;
    this.submitBtn.style.opacity = hasName ? '1' : '0.5';
    if (hasName) {
      this.clearError();
    }
  }

  /**
   * Submit form.
   */
  private submit(): void {
    const data = this.getData();
    if (!data.username) {
      this.setError('Please enter a name.');
      return;
    }
    if (this.onSubmit) {
      this.onSubmit(data);
    }
  }

  /**
   * Create a faction button.
   */
  private createFactionButton(label: string, faction: 'alliance' | 'horde'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '0.9rem',
      padding: '0.5em 1.5em',
      border: '1px solid #c5a55a',
      background: 'rgba(26, 17, 8, 0.7)',
      color: '#c5a55a',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
    } as CSSStyleDeclaration);

    btn.addEventListener('click', () => {
      this.selectedFaction = faction;
      this.updateFactionButtons();
      this.updateRaceCards();
    });

    return btn;
  }

  /**
   * Update faction button styles.
   */
  private updateFactionButtons(): void {
    const isAllianceSelected = this.selectedFaction === 'alliance';

    this.allianceBtn.style.background = isAllianceSelected
      ? 'rgba(50, 50, 150, 0.5)'
      : 'rgba(26, 17, 8, 0.7)';
    this.allianceBtn.style.textShadow = isAllianceSelected
      ? '0 0 10px rgba(100, 100, 255, 0.6)'
      : 'none';

    this.hordeBtn.style.background = !isAllianceSelected
      ? 'rgba(150, 50, 50, 0.5)'
      : 'rgba(26, 17, 8, 0.7)';
    this.hordeBtn.style.textShadow = !isAllianceSelected
      ? '0 0 10px rgba(255, 100, 100, 0.6)'
      : 'none';
  }

  /**
   * Update race card selections.
   */
  private updateRaceCards(): void {
    this.raceCardsContainer.innerHTML = '';
    const racesForFaction = RACES.filter((r) => r.faction === this.selectedFaction);

    racesForFaction.forEach((race) => {
      const card = document.createElement('button');
      card.textContent = race.label;
      const isSelected = this.selectedRace === race.id;

      Object.assign(card.style, {
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: '0.85rem',
        padding: '0.5em 1em',
        border: isSelected ? '2px solid ' + race.color : '1px solid ' + race.color,
        background: isSelected
          ? 'rgba(200, 200, 200, 0.1)'
          : 'rgba(26, 17, 8, 0.7)',
        color: race.color,
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      } as CSSStyleDeclaration);

      card.addEventListener('click', () => {
        this.selectedRace = race.id;
        this.selectedSkin = getDefaultPlayerSkin();
        this.updateRaceCards();
        this.updateSkinCards();
      });

      this.raceCardsContainer.appendChild(card);
    });
  }

  /**
   * Update skin card selections.
   */
  private updateSkinCards(): void {
    this.skinCardsContainer.innerHTML = '';
    const skins = getPlayerSkinOptions(this.selectedRace);

    skins.forEach((skin: { id: string; label: string }) => {
      const card = document.createElement('button');
      card.textContent = skin.label;
      const isSelected = this.selectedSkin === skin.id;

      Object.assign(card.style, {
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: '0.8rem',
        padding: '0.4em 0.8em',
        border: isSelected ? '2px solid #ffd700' : '1px solid #999',
        background: isSelected
          ? 'rgba(255, 215, 0, 0.15)'
          : 'rgba(26, 17, 8, 0.7)',
        color: isSelected ? '#ffd700' : '#999',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      } as CSSStyleDeclaration);

      card.addEventListener('click', () => {
        this.selectedSkin = skin.id;
        this.updateSkinCards();
      });

      this.skinCardsContainer.appendChild(card);
    });
  }
}
