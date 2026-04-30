/**
 * LoginScreen — Dark Portal title screen with character creation for World of Promptcraft.
 *
 * Renders a full-screen overlay with an animated dark-portal canvas,
 * title text, faction/race selection, username input, and an "Enter World" button.
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  brightness: number;
}

interface Lightning {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  width: number;
}

// ── Race definitions ─────────────────────────────────────────────────────

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

// ── LoginScreen class ──────────────────────────────────────────────────────

export class LoginScreen {
  onEnterWorld: ((username: string, race: string, faction: string) => void) | null = null;

  private overlay: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number = 0;
  private running = false;

  // Animation state
  private time = 0;
  private embers: Ember[] = [];
  private lightnings: Lightning[] = [];

  // Character creation state
  private selectedFaction: 'alliance' | 'horde' = 'alliance';
  private selectedRace: string = 'human';
  private usernameInput!: HTMLInputElement;
  private errorText!: HTMLDivElement;
  private enterBtn!: HTMLButtonElement;
  private raceCardsContainer!: HTMLDivElement;
  private allianceBtn!: HTMLButtonElement;
  private hordeBtn!: HTMLButtonElement;

  constructor() {
    // -- Load Cinzel font ---------------------------------------------------
    if (!document.querySelector('link[href*="Cinzel"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap';
      document.head.appendChild(link);
    }

    // -- Overlay container --------------------------------------------------
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '1000',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'opacity 0.8s ease',
      opacity: '1',
    } as CSSStyleDeclaration);

    // -- Canvas for portal animation ----------------------------------------
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
    } as CSSStyleDeclaration);
    this.overlay.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // -- Title --------------------------------------------------------------
    const title = document.createElement('div');
    title.textContent = 'WORLD OF PROMPTCRAFT';
    Object.assign(title.style, {
      position: 'relative',
      zIndex: '1',
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: 'clamp(2rem, 5vw, 4.5rem)',
      fontWeight: '900',
      color: '#c5a55a',
      textAlign: 'center',
      letterSpacing: '0.15em',
      textShadow:
        '0 0 20px rgba(197,165,90,0.6), 0 0 40px rgba(197,165,90,0.3), 0 2px 4px rgba(0,0,0,0.8)',
      marginBottom: '0.25em',
      userSelect: 'none',
      marginTop: '-5vh',
    } as CSSStyleDeclaration);
    this.overlay.appendChild(title);

    // -- Subtitle -----------------------------------------------------------
    const subtitle = document.createElement('div');
    subtitle.textContent = 'Powered by LangGraph';
    Object.assign(subtitle.style, {
      position: 'relative',
      zIndex: '1',
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: 'clamp(0.8rem, 1.8vw, 1.2rem)',
      color: '#aaaabb',
      textAlign: 'center',
      letterSpacing: '0.25em',
      textShadow: '0 0 10px rgba(170,170,187,0.3)',
      marginBottom: '2em',
      userSelect: 'none',
    } as CSSStyleDeclaration);
    this.overlay.appendChild(subtitle);

    // -- Character creation section -----------------------------------------
    this.buildCharacterCreation();

    // -- Enter World button -------------------------------------------------
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
      marginTop: '1.5em',
    } as CSSStyleDeclaration);

    this.enterBtn.addEventListener('mouseenter', () => {
      if (this.enterBtn.disabled) return;
      this.enterBtn.style.boxShadow =
        '0 0 30px rgba(197,165,90,0.5), inset 0 0 20px rgba(197,165,90,0.15)';
      this.enterBtn.style.borderColor = '#e0c872';
      this.enterBtn.style.color = '#e0c872';
      this.enterBtn.style.background = '#2a1f10';
    });
    this.enterBtn.addEventListener('mouseleave', () => {
      this.enterBtn.style.boxShadow =
        '0 0 15px rgba(197,165,90,0.15), inset 0 0 15px rgba(197,165,90,0.05)';
      this.enterBtn.style.borderColor = '#c5a55a';
      this.enterBtn.style.color = '#c5a55a';
      this.enterBtn.style.background = '#1a1108';
    });
    this.enterBtn.addEventListener('click', () => {
      const username = this.usernameInput.value.trim();
      if (!username) return;
      if (this.onEnterWorld) {
        this.onEnterWorld(username, this.selectedRace, this.selectedFaction);
      }
    });
    this.overlay.appendChild(this.enterBtn);

    // -- Version text -------------------------------------------------------
    const version = document.createElement('div');
    version.textContent = 'v0.2.0';
    Object.assign(version.style, {
      position: 'absolute',
      bottom: '12px',
      right: '16px',
      zIndex: '1',
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '0.75rem',
      color: '#555',
      userSelect: 'none',
    } as CSSStyleDeclaration);
    this.overlay.appendChild(version);

    // -- Seed embers --------------------------------------------------------
    this.seedEmbers(80);
  }

  // ── Character Creation UI ──────────────────────────────────────────────

  private buildCharacterCreation(): void {
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'relative',
      zIndex: '1',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1em',
    } as CSSStyleDeclaration);

    // ── Faction toggle ────────────────────────────────────────────────────
    const factionRow = document.createElement('div');
    Object.assign(factionRow.style, {
      display: 'flex',
      gap: '1em',
    } as CSSStyleDeclaration);

    this.allianceBtn = this.createFactionButton('ALLIANCE', 'alliance');
    this.hordeBtn = this.createFactionButton('HORDE', 'horde');
    factionRow.appendChild(this.allianceBtn);
    factionRow.appendChild(this.hordeBtn);
    container.appendChild(factionRow);

    // ── Race cards ────────────────────────────────────────────────────────
    this.raceCardsContainer = document.createElement('div');
    Object.assign(this.raceCardsContainer.style, {
      display: 'flex',
      gap: '1em',
    } as CSSStyleDeclaration);
    container.appendChild(this.raceCardsContainer);

    this.updateRaceCards();
    this.updateFactionButtons();

    // ── Username input ────────────────────────────────────────────────────
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
      const hasName = this.usernameInput.value.trim().length > 0;
      this.enterBtn.disabled = !hasName;
      this.enterBtn.style.opacity = hasName ? '1' : '0.5';
    });

    // Stop propagation to prevent game controls
    this.usernameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this.enterBtn.click();
      }
    });

    container.appendChild(this.usernameInput);

    // ── Error text ────────────────────────────────────────────────────────
    this.errorText = document.createElement('div');
    Object.assign(this.errorText.style, {
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '0.85rem',
      color: '#ff4444',
      textShadow: '0 0 6px rgba(255, 68, 68, 0.4)',
      display: 'none',
      textAlign: 'center',
    } as CSSStyleDeclaration);
    container.appendChild(this.errorText);

    this.overlay.appendChild(container);
  }

  private createFactionButton(label: string, faction: 'alliance' | 'horde'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '0.9rem',
      fontWeight: '700',
      letterSpacing: '0.1em',
      padding: '0.5em 1.5em',
      border: '2px solid #555',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      background: 'rgba(26, 17, 8, 0.8)',
      color: '#999',
    } as CSSStyleDeclaration);

    btn.addEventListener('click', () => {
      this.selectedFaction = faction;
      // Select first race of the new faction
      const firstRace = RACES.find(r => r.faction === faction);
      if (firstRace) this.selectedRace = firstRace.id;
      this.updateFactionButtons();
      this.updateRaceCards();
    });

    return btn;
  }

  private updateFactionButtons(): void {
    const selected = (btn: HTMLButtonElement, isSelected: boolean) => {
      btn.style.borderColor = isSelected ? '#c5a55a' : '#555';
      btn.style.color = isSelected ? '#c5a55a' : '#999';
      btn.style.boxShadow = isSelected
        ? '0 0 12px rgba(197, 165, 90, 0.3)'
        : 'none';
    };
    selected(this.allianceBtn, this.selectedFaction === 'alliance');
    selected(this.hordeBtn, this.selectedFaction === 'horde');
  }

  private updateRaceCards(): void {
    this.raceCardsContainer.innerHTML = '';
    const factionRaces = RACES.filter(r => r.faction === this.selectedFaction);
    for (const race of factionRaces) {
      const card = this.createRaceCard(race);
      this.raceCardsContainer.appendChild(card);
    }
  }

  private createRaceCard(race: RaceDef): HTMLDivElement {
    const card = document.createElement('div');
    const isSelected = this.selectedRace === race.id;

    Object.assign(card.style, {
      width: '100px',
      height: '100px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '6px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      background: isSelected ? race.color : 'rgba(26, 17, 8, 0.8)',
      border: isSelected ? '2px solid #c5a55a' : '2px solid #555',
      boxShadow: isSelected ? '0 0 15px rgba(197, 165, 90, 0.4)' : 'none',
    } as CSSStyleDeclaration);

    // Race icon (colored circle)
    const icon = document.createElement('div');
    Object.assign(icon.style, {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: race.color,
      marginBottom: '8px',
      border: '2px solid rgba(255,255,255,0.3)',
    } as CSSStyleDeclaration);
    card.appendChild(icon);

    // Race label
    const label = document.createElement('div');
    label.textContent = race.label;
    Object.assign(label.style, {
      fontFamily: "'Cinzel', Georgia, serif",
      fontSize: '0.75rem',
      fontWeight: '700',
      color: isSelected ? '#fff' : '#aaa',
      textAlign: 'center',
    } as CSSStyleDeclaration);
    card.appendChild(label);

    card.addEventListener('click', () => {
      this.selectedRace = race.id;
      this.updateRaceCards();
    });

    return card;
  }

  /** Display an error message below the username input. */
  showError(message: string): void {
    this.errorText.textContent = message;
    this.errorText.style.display = 'block';
    setTimeout(() => {
      this.errorText.style.display = 'none';
    }, 5000);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  show(): void {
    document.body.appendChild(this.overlay);
    this.resize();
    window.addEventListener('resize', this.handleResize);
    this.running = true;
    this.tick(0);
  }

  hide(): void {
    this.overlay.style.opacity = '0';
    this.running = false;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.handleResize);
    setTimeout(() => {
      // Only remove if still in the DOM and still hidden
      if (this.overlay.parentNode && this.overlay.style.opacity === '0') {
        this.overlay.remove();
      }
    }, 800);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private handleResize = (): void => {
    this.resize();
  };

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private seedEmbers(count: number): void {
    for (let i = 0; i < count; i++) {
      this.embers.push(this.createEmber(true));
    }
  }

  private createEmber(randomY = false): Ember {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    return {
      x: cx + (Math.random() - 0.5) * w * 0.5,
      y: randomY ? Math.random() * h : cy + Math.random() * h * 0.3,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(0.3 + Math.random() * 1.0),
      size: 1 + Math.random() * 2.5,
      life: randomY ? Math.random() : 1,
      maxLife: 1,
      brightness: 0.4 + Math.random() * 0.6,
    };
  }

  // ── Portal drawing ──────────────────────────────────────────────────────

  private drawPortal(w: number, h: number): void {
    const ctx = this.ctx;
    const cx = w / 2;
    const cy = h / 2;

    // Portal dimensions — responsive
    const portalW = Math.min(w * 0.32, 400);
    const portalH = Math.min(h * 0.55, 500);
    const pillarW = portalW * 0.18;
    const archThickness = pillarW * 0.85;

    const leftX = cx - portalW / 2;
    const rightX = cx + portalW / 2 - pillarW;
    const topY = cy - portalH / 2;
    const botY = cy + portalH / 2;

    // -- Ambient glow behind everything ------------------------------------
    const ambientGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, portalH * 0.9);
    ambientGlow.addColorStop(0, 'rgba(0, 255, 136, 0.08)');
    ambientGlow.addColorStop(0.5, 'rgba(0, 68, 34, 0.04)');
    ambientGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambientGlow;
    ctx.fillRect(0, 0, w, h);

    // -- Swirling vortex inside portal frame --------------------------------
    this.drawVortex(ctx, cx, cy, portalW - pillarW * 2, portalH - archThickness);

    // -- Stone pillars ------------------------------------------------------
    this.drawPillar(ctx, leftX, topY + archThickness * 0.3, pillarW, portalH - archThickness * 0.3);
    this.drawPillar(ctx, rightX, topY + archThickness * 0.3, pillarW, portalH - archThickness * 0.3);

    // -- Arch ---------------------------------------------------------------
    this.drawArch(ctx, cx, topY, portalW, archThickness);

    // -- Ground scorched earth ---------------------------------------------
    const groundY = botY;
    const groundGrad = ctx.createLinearGradient(0, groundY - 30, 0, h);
    groundGrad.addColorStop(0, 'rgba(10, 10, 10, 0)');
    groundGrad.addColorStop(0.15, 'rgba(20, 15, 10, 0.7)');
    groundGrad.addColorStop(1, 'rgba(15, 10, 5, 0.9)');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY - 30, w, h - groundY + 30);
  }

  private drawVortex(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    vw: number,
    vh: number,
  ): void {
    const t = this.time;
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.5);
    const radius = Math.min(vw, vh) / 2;

    ctx.save();
    ctx.translate(cx, cy);

    // Depth background
    const depthGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    depthGrad.addColorStop(0, '#004422');
    depthGrad.addColorStop(0.6, '#002211');
    depthGrad.addColorStop(1, '#000a05');
    ctx.beginPath();
    ctx.ellipse(0, 0, vw / 2, vh / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = depthGrad;
    ctx.fill();

    // Concentric swirling rings
    for (let ring = 0; ring < 8; ring++) {
      const rFrac = ring / 8;
      const rRad = radius * (1 - rFrac) * 0.95;
      const angle = t * (1.2 + ring * 0.3) * (ring % 2 === 0 ? 1 : -1);
      const alpha = (0.12 + 0.08 * Math.sin(t * 2 + ring)) * pulse;

      ctx.save();
      ctx.rotate(angle);

      const grad = ctx.createLinearGradient(-rRad, -rRad, rRad, rRad);
      grad.addColorStop(0, `rgba(0, 255, 136, ${alpha})`);
      grad.addColorStop(0.3, `rgba(0, 204, 170, ${alpha * 0.7})`);
      grad.addColorStop(0.6, `rgba(0, 68, 34, ${alpha * 0.3})`);
      grad.addColorStop(1, `rgba(0, 255, 136, ${alpha * 0.8})`);

      ctx.beginPath();
      ctx.ellipse(0, 0, rRad * (vw / vh), rRad, 0, 0, Math.PI * 2);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3 + 4 * rFrac;
      ctx.stroke();
      ctx.restore();
    }

    // Bright core
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.35);
    coreGrad.addColorStop(0, `rgba(0, 255, 170, ${0.25 * pulse})`);
    coreGrad.addColorStop(0.5, `rgba(0, 200, 140, ${0.1 * pulse})`);
    coreGrad.addColorStop(1, 'rgba(0, 100, 60, 0)');
    ctx.beginPath();
    ctx.ellipse(0, 0, vw / 2, vh / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    ctx.restore();
  }

  private drawPillar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    // Main pillar body
    const pillarGrad = ctx.createLinearGradient(x, y, x + w, y);
    pillarGrad.addColorStop(0, '#3a3a3a');
    pillarGrad.addColorStop(0.3, '#555555');
    pillarGrad.addColorStop(0.7, '#4a4a4a');
    pillarGrad.addColorStop(1, '#333333');
    ctx.fillStyle = pillarGrad;
    ctx.fillRect(x, y, w, h);

    // Dark edges to give depth
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);

    // Cracks / wear — deterministic lines based on position
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const cy = y + h * ((i * 0.17 + 0.05) % 1);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.15, cy);
      ctx.lineTo(x + w * 0.6, cy + (i % 2 === 0 ? 4 : -3));
      ctx.stroke();
    }

    // Crumble at bottom
    for (let i = 0; i < 5; i++) {
      const bx = x + (i / 5) * w;
      const by = y + h - 2 + Math.sin(i * 2.3) * 4;
      ctx.fillStyle = `rgba(${50 + i * 5}, ${50 + i * 3}, ${50 + i * 2}, 0.7)`;
      ctx.fillRect(bx, by, w / 5, 4);
    }
  }

  private drawArch(
    ctx: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    totalW: number,
    thickness: number,
  ): void {
    const halfW = totalW / 2;

    ctx.save();
    ctx.translate(cx, topY + thickness);

    // Arch shape
    const archGrad = ctx.createLinearGradient(0, -thickness, 0, thickness * 0.5);
    archGrad.addColorStop(0, '#555');
    archGrad.addColorStop(0.5, '#444');
    archGrad.addColorStop(1, '#333');

    ctx.beginPath();
    ctx.ellipse(0, 0, halfW, thickness * 1.5, 0, Math.PI, 0);
    ctx.lineTo(halfW, thickness * 0.2);
    ctx.ellipse(0, thickness * 0.2, halfW - thickness * 0.5, thickness, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = archGrad;
    ctx.fill();

    // Dark inner edge
    ctx.beginPath();
    ctx.ellipse(0, thickness * 0.2, halfW - thickness * 0.5, thickness, 0, 0, Math.PI);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Keystone highlight
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(-thickness * 0.3, -thickness * 1.4, thickness * 0.6, thickness * 0.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(-thickness * 0.3, -thickness * 1.4, thickness * 0.6, thickness * 0.5);

    ctx.restore();
  }

  // ── Embers ──────────────────────────────────────────────────────────────

  private updateEmbers(dt: number, _w: number, _h: number): void {
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.x += e.vx;
      e.y += e.vy;
      e.life -= dt * 0.2;
      if (e.life <= 0 || e.y < -10) {
        this.embers[i] = this.createEmber(false);
      }
    }
    // Keep count around 80
    while (this.embers.length < 80) {
      this.embers.push(this.createEmber(false));
    }
  }

  private drawEmbers(ctx: CanvasRenderingContext2D): void {
    for (const e of this.embers) {
      const alpha = e.life * e.brightness;
      if (alpha <= 0) continue;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 136, ${alpha.toFixed(3)})`;
      ctx.fill();
      // Glow
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 136, ${(alpha * 0.15).toFixed(3)})`;
      ctx.fill();
    }
  }

  // ── Lightning crackles ──────────────────────────────────────────────────

  private maybeSpawnLightning(w: number, h: number): void {
    if (Math.random() > 0.02) return; // ~2 % chance per frame
    const cx = w / 2;
    const cy = h / 2;
    const angle = Math.random() * Math.PI * 2;
    const r1 = 30 + Math.random() * 60;
    const r2 = r1 + 30 + Math.random() * 80;
    this.lightnings.push({
      x1: cx + Math.cos(angle) * r1,
      y1: cy + Math.sin(angle) * r1,
      x2: cx + Math.cos(angle + (Math.random() - 0.5) * 0.6) * r2,
      y2: cy + Math.sin(angle + (Math.random() - 0.5) * 0.6) * r2,
      life: 1,
      maxLife: 1,
      width: 1 + Math.random() * 2,
    });
  }

  private updateAndDrawLightning(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      const l = this.lightnings[i];
      l.life -= dt * 5;
      if (l.life <= 0) {
        this.lightnings.splice(i, 1);
        continue;
      }
      const alpha = l.life;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      // Jagged mid-point
      const mx = (l.x1 + l.x2) / 2 + (Math.random() - 0.5) * 20;
      const my = (l.y1 + l.y2) / 2 + (Math.random() - 0.5) * 20;
      ctx.lineTo(mx, my);
      ctx.lineTo(l.x2, l.y2);
      ctx.strokeStyle = `rgba(0, 255, 200, ${alpha.toFixed(3)})`;
      ctx.lineWidth = l.width * alpha;
      ctx.shadowColor = 'rgba(0, 255, 170, 0.6)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // ── Animation loop ──────────────────────────────────────────────────────

  private tick = (_timestamp: number): void => {
    if (!this.running) return;

    const dt = 1 / 60; // constant dt — looks consistent regardless of frame rate jitter
    this.time += dt;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const ctx = this.ctx;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Subtle dark-green atmospheric gradient
    const skyGrad = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, h);
    skyGrad.addColorStop(0, 'rgba(0, 30, 15, 0.3)');
    skyGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Portal scene
    this.drawPortal(w, h);

    // Embers
    this.updateEmbers(dt, w, h);
    this.drawEmbers(ctx);

    // Lightning
    this.maybeSpawnLightning(w, h);
    this.updateAndDrawLightning(ctx, dt);

    this.animationId = requestAnimationFrame(this.tick);
  };
}
