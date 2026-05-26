import { getDefaultPlayerSkin, getPlayerSkinOptions, type PlayerSkinId } from '../../entities/PlayerSkins';

interface RaceDef {
  id: string;
  label: string;
  color: string;
  faction: 'alliance' | 'horde';
}

const RACES: RaceDef[] = [
  { id: 'human',     label: 'Human',    color: '#c4a882', faction: 'alliance' },
  { id: 'night_elf', label: 'Night Elf', color: '#8866cc', faction: 'alliance' },
  { id: 'orc',       label: 'Orc',      color: '#44aa44', faction: 'horde'    },
  { id: 'undead',    label: 'Undead',   color: '#88aaaa', faction: 'horde'    },
];

export interface CharacterSelectionResult {
  username: string;
  race: string;
  faction: 'alliance' | 'horde';
  skin: string;
}

export class CharacterCreation {
  readonly element: HTMLDivElement;

  onSubmit: ((result: CharacterSelectionResult) => void) | null = null;

  private selectedFaction: 'alliance' | 'horde' = 'alliance';
  private selectedRace = 'human';
  private selectedSkin = getDefaultPlayerSkin();

  private usernameInput!: HTMLInputElement;
  private enterBtn!: HTMLButtonElement;
  private errorText!: HTMLDivElement;
  private raceCardsContainer!: HTMLDivElement;
  private skinCardsContainer!: HTMLDivElement;
  private allianceBtn!: HTMLButtonElement;
  private hordeBtn!: HTMLButtonElement;

  constructor() {
    this.element = document.createElement('div');
    Object.assign(this.element.style, {
      position:       'relative',
      zIndex:         '1',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      gap:            '1em',
    } as CSSStyleDeclaration);
    this.build();
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

  private build(): void {
    const factionRow = document.createElement('div');
    Object.assign(factionRow.style, { display: 'flex', gap: '1em' } as CSSStyleDeclaration);
    this.allianceBtn = this.createFactionButton('ALLIANCE', 'alliance');
    this.hordeBtn    = this.createFactionButton('HORDE',    'horde');
    factionRow.appendChild(this.allianceBtn);
    factionRow.appendChild(this.hordeBtn);
    this.element.appendChild(factionRow);

    this.raceCardsContainer = document.createElement('div');
    Object.assign(this.raceCardsContainer.style, { display: 'flex', gap: '1em' } as CSSStyleDeclaration);
    this.element.appendChild(this.raceCardsContainer);
    this.updateRaceCards();
    this.updateFactionButtons();

    this.skinCardsContainer = document.createElement('div');
    Object.assign(this.skinCardsContainer.style, {
      display: 'flex', gap: '1em', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '460px',
    } as CSSStyleDeclaration);
    this.element.appendChild(this.skinCardsContainer);
    this.updateSkinCards();

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
      this.onSubmit?.({ username, race: this.selectedRace, faction: this.selectedFaction, skin: this.selectedSkin });
    });
    this.element.appendChild(this.enterBtn);
  }

  private createFactionButton(label: string, faction: 'alliance' | 'horde'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      fontFamily:    "'Cinzel', Georgia, serif",
      fontSize:      '0.9rem',
      fontWeight:    '700',
      letterSpacing: '0.1em',
      padding:       '0.5em 1.5em',
      border:        '2px solid #555',
      borderRadius:  '4px',
      cursor:        'pointer',
      transition:    'all 0.2s ease',
      background:    'rgba(26, 17, 8, 0.8)',
      color:         '#999',
    } as CSSStyleDeclaration);
    btn.addEventListener('click', () => {
      this.selectedFaction = faction;
      const firstRace = RACES.find(r => r.faction === faction);
      if (firstRace) this.selectedRace = firstRace.id;
      this.updateFactionButtons();
      this.updateRaceCards();
      this.updateSkinCards();
    });
    return btn;
  }

  private updateFactionButtons(): void {
    const style = (btn: HTMLButtonElement, active: boolean) => {
      btn.style.borderColor = active ? '#c5a55a' : '#555';
      btn.style.color       = active ? '#c5a55a' : '#999';
      btn.style.boxShadow   = active ? '0 0 12px rgba(197, 165, 90, 0.3)' : 'none';
    };
    style(this.allianceBtn, this.selectedFaction === 'alliance');
    style(this.hordeBtn,    this.selectedFaction === 'horde');
  }

  private updateRaceCards(): void {
    this.raceCardsContainer.innerHTML = '';
    for (const race of RACES.filter(r => r.faction === this.selectedFaction)) {
      this.raceCardsContainer.appendChild(this.createRaceCard(race));
    }
  }

  private createRaceCard(race: RaceDef): HTMLDivElement {
    const isSelected = this.selectedRace === race.id;
    const card = document.createElement('div');
    Object.assign(card.style, {
      width: '100px', height: '100px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s ease',
      background: isSelected ? race.color : 'rgba(26, 17, 8, 0.8)',
      border:     isSelected ? '2px solid #c5a55a' : '2px solid #555',
      boxShadow:  isSelected ? '0 0 15px rgba(197, 165, 90, 0.4)' : 'none',
    } as CSSStyleDeclaration);
    const icon = document.createElement('div');
    Object.assign(icon.style, {
      width: '40px', height: '40px', borderRadius: '50%',
      background: race.color, marginBottom: '8px', border: '2px solid rgba(255,255,255,0.3)',
    } as CSSStyleDeclaration);
    card.appendChild(icon);
    const label = document.createElement('div');
    label.textContent = race.label;
    Object.assign(label.style, {
      fontFamily: "'Cinzel', Georgia, serif", fontSize: '0.75rem', fontWeight: '700',
      color: isSelected ? '#fff' : '#aaa', textAlign: 'center',
    } as CSSStyleDeclaration);
    card.appendChild(label);
    card.addEventListener('click', () => {
      this.selectedRace = race.id;
      this.updateRaceCards();
      this.updateSkinCards();
    });
    return card;
  }

  private updateSkinCards(): void {
    this.skinCardsContainer.innerHTML = '';
    for (const skin of getPlayerSkinOptions(this.selectedRace)) {
      this.skinCardsContainer.appendChild(this.createSkinCard(skin.id, skin.label));
    }
  }

  private createSkinCard(skinId: PlayerSkinId, labelText: string): HTMLDivElement {
    const isSelected = this.selectedSkin === skinId;
    const card = document.createElement('div');
    Object.assign(card.style, {
      width: '96px', height: '72px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s ease',
      background: isSelected ? 'rgba(197, 165, 90, 0.22)' : 'rgba(26, 17, 8, 0.8)',
      border:    isSelected ? '2px solid #e0c872' : '2px solid #555',
      boxShadow: isSelected ? '0 0 15px rgba(197, 165, 90, 0.35)' : 'none',
    } as CSSStyleDeclaration);
    const badge = document.createElement('div');
    badge.textContent = skinId.split('-')[1] ?? '';
    Object.assign(badge.style, {
      width: '30px', height: '30px', borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', background: '#3b2a18', border: '1px solid rgba(255,255,255,0.2)',
      marginBottom: '6px', fontFamily: "'Cinzel', Georgia, serif", fontSize: '0.8rem', fontWeight: '700',
    } as CSSStyleDeclaration);
    card.appendChild(badge);
    const label = document.createElement('div');
    label.textContent = labelText;
    Object.assign(label.style, {
      fontFamily: "'Cinzel', Georgia, serif", fontSize: '0.72rem', fontWeight: '700',
      color: isSelected ? '#fff' : '#aaa', textAlign: 'center',
    } as CSSStyleDeclaration);
    card.appendChild(label);
    card.addEventListener('click', () => {
      this.selectedSkin = skinId;
      this.updateSkinCards();
    });
    return card;
  }
}
