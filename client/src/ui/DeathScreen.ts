import { UIComponent } from "./core/UIComponent";

/**
 * DeathScreen -- Dramatic full-screen "YOU DIED" overlay.
 * Extends UIComponent for consistent lifecycle management.
 *
 * Shown when the player's HP reaches 0. Displays a red-themed death
 * screen with a respawn button that returns the player to the village.
 */
export class DeathScreen extends UIComponent {
  onRespawn: (() => void) | null = null;

  declare private titleEl: HTMLDivElement;
  declare private subtitleEl: HTMLDivElement;
  declare private respawnBtn: HTMLButtonElement;
  declare private hintEl: HTMLDivElement;
  private pulseId: number = 0;

  constructor() {
    super('ui-root', 'death-screen');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '2000',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'auto',
      opacity: '0',
      transition: 'opacity 1s ease',
      background: 'radial-gradient(ellipse at center, rgba(80,0,0,0.92) 0%, rgba(20,0,0,0.95) 50%, rgba(0,0,0,0.98) 100%)',
      boxShadow: 'inset 0 0 150px 60px rgba(120,0,0,0.5), inset 0 0 300px 100px rgba(60,0,0,0.3)',
      fontFamily: "'Cinzel', Georgia, serif",
    } as CSSStyleDeclaration);

    // -- "YOU DIED" title ---------------------------------------------------
    this.titleEl = document.createElement('div');
    this.titleEl.textContent = 'YOU DIED';
    Object.assign(this.titleEl.style, {
      fontSize: '72px',
      fontWeight: '900',
      color: '#cc2222',
      textAlign: 'center',
      letterSpacing: '0.15em',
      textShadow:
        '0 0 20px rgba(200,0,0,0.8), 0 0 40px rgba(200,0,0,0.5), 0 0 80px rgba(150,0,0,0.3), 0 2px 4px rgba(0,0,0,0.9)',
      userSelect: 'none',
      marginBottom: '16px',
      transform: 'scale(0.8)',
      transition: 'transform 1.2s ease-out',
    } as CSSStyleDeclaration);
    this.container.appendChild(this.titleEl);

    // -- "Slain by ..." subtitle --------------------------------------------
    this.subtitleEl = document.createElement('div');
    Object.assign(this.subtitleEl.style, {
      fontSize: '24px',
      fontWeight: '400',
      color: '#888888',
      textAlign: 'center',
      textShadow: '0 0 10px rgba(100,0,0,0.4)',
      userSelect: 'none',
      marginBottom: '48px',
      opacity: '0',
      transition: 'opacity 1.5s ease 0.5s',
    } as CSSStyleDeclaration);
    this.container.appendChild(this.subtitleEl);

    // -- Respawn button -----------------------------------------------------
    this.respawnBtn = document.createElement('button');
    this.respawnBtn.textContent = 'Respawn';
    Object.assign(this.respawnBtn.style, {
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
      opacity: '0',
      transform: 'translateY(20px)',
      pointerEvents: 'auto',
    } as CSSStyleDeclaration);

    this.respawnBtn.addEventListener('mouseenter', () => {
      this.respawnBtn.style.boxShadow =
        '0 0 30px rgba(197,165,90,0.5), inset 0 0 20px rgba(197,165,90,0.15)';
      this.respawnBtn.style.borderColor = '#e0c872';
      this.respawnBtn.style.color = '#e0c872';
      this.respawnBtn.style.background = '#2a1f10';
    });
    this.respawnBtn.addEventListener('mouseleave', () => {
      this.respawnBtn.style.boxShadow =
        '0 0 15px rgba(197,165,90,0.15), inset 0 0 15px rgba(197,165,90,0.05)';
      this.respawnBtn.style.borderColor = '#c5a55a';
      this.respawnBtn.style.color = '#c5a55a';
      this.respawnBtn.style.background = '#1a1108';
    });
    this.respawnBtn.addEventListener('click', () => {
      if (this.onRespawn) this.onRespawn();
    });
    this.container.appendChild(this.respawnBtn);

    // -- Hint text ----------------------------------------------------------
    this.hintEl = document.createElement('div');
    this.hintEl.textContent = 'You will respawn at the village';
    Object.assign(this.hintEl.style, {
      fontSize: '14px',
      fontWeight: '400',
      color: '#666666',
      textAlign: 'center',
      userSelect: 'none',
      marginTop: '16px',
      opacity: '0',
      transition: 'opacity 2s ease 1.5s',
    } as CSSStyleDeclaration);
    this.container.appendChild(this.hintEl);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  show(killerName?: string): void {
    // Set subtitle
    if (killerName) {
      this.subtitleEl.textContent = `Slain by ${killerName}`;
    } else {
      this.subtitleEl.textContent = '';
    }

    // Reset animation state
    this.container.style.display = 'flex';
    this.container.style.opacity = '0';
    this.titleEl.style.transform = 'scale(0.8)';
    this.subtitleEl.style.opacity = '0';
    this.respawnBtn.style.opacity = '0';
    this.respawnBtn.style.transform = 'translateY(20px)';
    this.hintEl.style.opacity = '0';

    // Trigger fade-in on next frame
    requestAnimationFrame(() => {
      this.container.style.opacity = '1';
      this.titleEl.style.transform = 'scale(1)';
      this.subtitleEl.style.opacity = '1';

      // Delay button appearance
      setTimeout(() => {
        this.respawnBtn.style.opacity = '1';
        this.respawnBtn.style.transform = 'translateY(0)';
        this.respawnBtn.style.transition = 'all 0.5s ease';
      }, 1200);

      this.hintEl.style.opacity = '1';
    });

    // Start background pulse
    this.startPulse();
  }

  protected override onHide(): void {
    this.stopPulse();
    this.container.style.opacity = '0';
    setTimeout(() => {
      // Only hide if still faded out (guards against show/hide race)
      if (this.container.style.opacity === '0') {
        this.container.style.display = 'none';
      }
    }, 1000);
  }

  protected override onDispose(): void {
    this.stopPulse();
  }

  get element(): HTMLElement {
    return this.container;
  }

  // ── Internals ──────────────────────────────────────────────────────

  private startPulse(): void {
    let time = 0;
    const pulse = () => {
      time += 0.02;
      const intensity = 0.88 + 0.04 * Math.sin(time * 1.5);
      this.container.style.background =
        `radial-gradient(ellipse at center, rgba(${Math.round(80 * intensity)},0,0,0.92) 0%, rgba(${Math.round(20 * intensity)},0,0,0.95) 50%, rgba(0,0,0,0.98) 100%)`;
      this.pulseId = requestAnimationFrame(pulse);
    };
    this.pulseId = requestAnimationFrame(pulse);
  }

  private stopPulse(): void {
    if (this.pulseId) {
      cancelAnimationFrame(this.pulseId);
      this.pulseId = 0;
    }
  }
}
