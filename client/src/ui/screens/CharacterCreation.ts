import { CharacterPreview } from './CharacterPreview';
import { isPhone } from '../../utils/DeviceDetection';

interface RaceDef {
  id: string;
  label: string;
  color: string;
  faction: 'alliance' | 'horde';
}

// Faction is no longer chosen on screen — it is derived from the selected race
// so downstream systems (nameplate colour, server state) keep working.
const RACES: RaceDef[] = [
  { id: 'human',     label: 'Human',     color: '#c4a882', faction: 'alliance' },
  { id: 'night_elf', label: 'Night Elf', color: '#8866cc', faction: 'alliance' },
  { id: 'orc',       label: 'Orc',       color: '#44aa44', faction: 'horde'    },
  { id: 'undead',    label: 'Undead',    color: '#88aaaa', faction: 'horde'    },
];

export interface CharacterSelectionResult {
  username: string;
  race: string;
  faction: 'alliance' | 'horde';
}

export class CharacterCreation {
  readonly element: HTMLDivElement;

  onSubmit: ((result: CharacterSelectionResult) => void) | null = null;

  private selectedRace = 'human';

  private readonly preview: CharacterPreview;

  private usernameInput!: HTMLInputElement;
  private enterBtn!: HTMLButtonElement;
  private errorText!: HTMLDivElement;
  private raceCardsContainer!: HTMLDivElement;

  constructor() {
    this.preview = new CharacterPreview();
    this.element = document.createElement('div');
    Object.assign(this.element.style, {
      position:       'relative',
      zIndex:         '1',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      gap:            '1.2em',
    } as CSSStyleDeclaration);
    this.build();
    this.preview.setRace(this.selectedRace);
    this.preview.start();
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.errorText.style.display = 'block';
    setTimeout(() => { this.errorText.style.display = 'none'; }, 5000);
  }

  setEnterBtnEnabled(enabled: boolean): void {
    this.enterBtn.disabled = !enabled;
    this.enterBtn.style.opacity = enabled ? '1' : '0.5';
  }

  /** Tear down the 3D preview renderer. Call when leaving the login screen. */
  dispose(): void {
    this.preview.dispose();
  }

  private factionFor(raceId: string): 'alliance' | 'horde' {
    return RACES.find((r) => r.id === raceId)?.faction ?? 'alliance';
  }

  private build(): void {
    // ── Two-column layout: 3D preview (left) | race list (right) ──
    const columns = document.createElement('div');
    Object.assign(columns.style, {
      display: 'flex', gap: '2.5em', alignItems: 'center', justifyContent: 'center',
    } as CSSStyleDeclaration);

    const previewPane = document.createElement('div');
    Object.assign(previewPane.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '8px',
      border: '1px solid rgba(197, 165, 90, 0.35)',
      background: 'rgba(10, 8, 4, 0.35)',
      boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
    } as CSSStyleDeclaration);
    previewPane.appendChild(this.preview.canvas);
    columns.appendChild(previewPane);

    this.raceCardsContainer = document.createElement('div');
    Object.assign(this.raceCardsContainer.style, {
      display: 'flex', flexDirection: 'column', gap: '0.6em', minWidth: '200px',
    } as CSSStyleDeclaration);
    columns.appendChild(this.raceCardsContainer);
    this.updateRaceCards();

    // Phone: stack preview over a wrapped race grid, and shrink the 3D preview
    // canvas (CSS only — the renderer bitmap is unchanged) so the whole form
    // fits and the "Enter World" button below stays reachable.
    if (isPhone()) {
      Object.assign(columns.style, {
        flexDirection: 'column',
        gap: '1em',
      } as CSSStyleDeclaration);
      Object.assign(this.preview.canvas.style, {
        width: '190px',
        height: '250px',
      } as CSSStyleDeclaration);
      Object.assign(this.raceCardsContainer.style, {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        minWidth: '0',
      } as CSSStyleDeclaration);
    }

    this.element.appendChild(columns);

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
    this.usernameInput.addEventListener('input', () => {
      this.setEnterBtnEnabled(this.usernameInput.value.trim().length > 0);
    });
    this.usernameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.enterBtn.click();
    });
    this.element.appendChild(this.usernameInput);

    this.errorText = document.createElement('div');
    Object.assign(this.errorText.style, {
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '0.85rem',
      color: '#ff4444',
      textShadow: '0 0 6px rgba(255, 68, 68, 0.4)',
      display: 'none',
      textAlign: 'center',
    } as CSSStyleDeclaration);
    this.element.appendChild(this.errorText);

    this.enterBtn = document.createElement('button');
    this.enterBtn.textContent = 'Enter World';
    this.enterBtn.disabled = true;
    Object.assign(this.enterBtn.style, {
      position: 'relative',
      zIndex: '1',
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: 'clamp(1rem, 2.2vw, 1.5rem)',
      fontWeight: '700',
      letterSpacing: '0.15em',
      color: '#c5a55a',
      background: '#1a1108',
      border: '2px solid #c5a55a',
      borderRadius: '4px',
      padding: '0.7em 2.5em',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      textShadow: '0 0 8px rgba(197,165,90,0.4)',
      boxShadow: '0 0 15px rgba(197,165,90,0.15), inset 0 0 15px rgba(197,165,90,0.05)',
      marginTop: '0.5em',
      opacity: '0.5',
    } as CSSStyleDeclaration);
    this.enterBtn.addEventListener('mouseenter', () => {
      if (this.enterBtn.disabled) return;
      this.enterBtn.style.boxShadow  = '0 0 30px rgba(197,165,90,0.5), inset 0 0 20px rgba(197,165,90,0.15)';
      this.enterBtn.style.borderColor = '#e0c872';
      this.enterBtn.style.color       = '#e0c872';
      this.enterBtn.style.background  = '#2a1f10';
    });
    this.enterBtn.addEventListener('mouseleave', () => {
      this.enterBtn.style.boxShadow  = '0 0 15px rgba(197,165,90,0.15), inset 0 0 15px rgba(197,165,90,0.05)';
      this.enterBtn.style.borderColor = '#c5a55a';
      this.enterBtn.style.color       = '#c5a55a';
      this.enterBtn.style.background  = '#1a1108';
    });
    this.enterBtn.addEventListener('click', () => {
      const username = this.usernameInput.value.trim();
      if (!username) return;
      this.onSubmit?.({ username, race: this.selectedRace, faction: this.factionFor(this.selectedRace) });
    });
    this.element.appendChild(this.enterBtn);
  }

  private updateRaceCards(): void {
    this.raceCardsContainer.innerHTML = '';
    for (const race of RACES) {
      this.raceCardsContainer.appendChild(this.createRaceCard(race));
    }
  }

  private createRaceCard(race: RaceDef): HTMLDivElement {
    const isSelected = this.selectedRace === race.id;
    const card = document.createElement('div');
    Object.assign(card.style, {
      display: 'flex', alignItems: 'center', gap: '0.8em',
      padding: '0.6em 1em',
      borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s ease',
      background: isSelected ? 'rgba(197, 165, 90, 0.18)' : 'rgba(26, 17, 8, 0.8)',
      border:     isSelected ? '2px solid #c5a55a' : '2px solid #555',
      boxShadow:  isSelected ? '0 0 15px rgba(197, 165, 90, 0.4)' : 'none',
    } as CSSStyleDeclaration);
    const icon = document.createElement('div');
    Object.assign(icon.style, {
      width: '28px', height: '28px', borderRadius: '50%', flexShrink: '0',
      background: race.color, border: '2px solid rgba(255,255,255,0.3)',
    } as CSSStyleDeclaration);
    card.appendChild(icon);
    const label = document.createElement('div');
    label.textContent = race.label;
    Object.assign(label.style, {
      fontFamily: "'Cinzel', Georgia, serif", fontSize: '0.95rem', fontWeight: '700',
      letterSpacing: '0.05em',
      color: isSelected ? '#fff' : '#aaa',
    } as CSSStyleDeclaration);
    card.appendChild(label);
    card.addEventListener('click', () => {
      this.selectedRace = race.id;
      this.updateRaceCards();
      this.preview.setRace(this.selectedRace);
    });
    return card;
  }
}
