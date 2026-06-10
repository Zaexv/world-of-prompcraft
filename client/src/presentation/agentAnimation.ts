/**
 * Drives the slide-11 "agent in action" animation:
 *   - highlights diagram nodes in the order the LangGraph agent executes
 *   - glows the matching trace section simultaneously
 *   - pulses the loop-rail bracket when act feeds back into reason
 *   - types the player message and NPC response into the chat panel
 * Loops continuously while the slide is active.
 */

const PLAYER_TEXT  = '¡Buenos días, Paco! Some churros, please.';
const NPC_TEXT     = '¡Recién hechos, hombre! Ten gold the ración — finest oil in Fort Malaka.';
const REASON_TEXT  =
  'A breakfast order from a morning regular — wave hello. ' +
  'Ración de Churros is 10g, they carry 120g. ' +
  'Fry a fresh batch (smoke from the hot oil), then make the offer.';

interface Step {
  node:      string;        // DOM id of the .ad-node element
  trace:     string | null; // .trace-section sub-class (reason|act|respond)
  loopRail:  boolean;       // whether to light the loop bracket during this step
  at:        number;        // ms from cycle start
  dur:       number;        // ms active
}

const STEPS: Step[] = [
  { node: 'adn-prompt',  trace: null,      loopRail: false, at: 200,  dur: 700  },
  { node: 'adn-reason',  trace: 'reason',  loopRail: false, at: 700,  dur: 1400 },
  { node: 'adn-act',     trace: 'act',     loopRail: false, at: 1900, dur: 1300 },
  // act fires back to reason — bracket glows to show the loop
  { node: 'adn-reason',  trace: 'reason',  loopRail: true,  at: 3000, dur: 600  },
  { node: 'adn-respond', trace: 'respond', loopRail: false, at: 3800, dur: 1100 },
  { node: 'adn-update',  trace: null,      loopRail: false, at: 4700, dur: 800  },
];

const NPC_SHOW_AT = 5100;

export class AgentAnimation {
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.cycle();
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    this.clearAll();
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private clearAll(): void {
    document.querySelectorAll<HTMLElement>('.ad-node--active')
      .forEach(el => el.classList.remove('ad-node--active'));
    document.querySelectorAll<HTMLElement>('.trace-section--active')
      .forEach(el => el.classList.remove('trace-section--active'));
    document.getElementById('adLoopRail')?.classList.remove('ad-loop-rail--active');
    const p = document.getElementById('igcPlayerBubble') as HTMLElement | null;
    const n = document.getElementById('igcNpcBubble') as HTMLElement | null;
    const t = document.getElementById('traceReasonThought') as HTMLElement | null;
    if (p) { p.textContent = ''; p.style.opacity = '0'; }
    if (n) { n.textContent = ''; n.style.opacity = '0'; }
    if (t) { t.textContent = ''; }
  }

  private activate(s: Step): void {
    document.getElementById(s.node)?.classList.add('ad-node--active');
    if (s.trace) {
      document.querySelector(`.trace-section.${s.trace}`)?.classList.add('trace-section--active');
    }
    if (s.loopRail) {
      document.getElementById('adLoopRail')?.classList.add('ad-loop-rail--active');
    }
  }

  private deactivate(s: Step): void {
    document.getElementById(s.node)?.classList.remove('ad-node--active');
    if (s.trace) {
      document.querySelector(`.trace-section.${s.trace}`)?.classList.remove('trace-section--active');
    }
    if (s.loopRail) {
      document.getElementById('adLoopRail')?.classList.remove('ad-loop-rail--active');
    }
  }

  private type(elId: string, text: string): void {
    const el = document.getElementById(elId) as HTMLElement | null;
    if (!el) return;
    el.style.opacity = '1';
    el.textContent = '';
    let i = 0;
    const step = (): void => {
      if (!this.running) return;
      el.textContent = text.slice(0, ++i);
      if (i < text.length) this.after(26, step);
    };
    this.after(26, step);
  }

  private cycle(): void {
    if (!this.running) return;
    this.clearAll();

    this.after(100, () => { if (this.running) this.type('igcPlayerBubble', PLAYER_TEXT); });

    // Reason thought types in while reason node is active (starts slightly after activation)
    this.after(900, () => { if (this.running) this.type('traceReasonThought', REASON_TEXT); });

    for (const s of STEPS) {
      this.after(s.at, () => { if (this.running) this.activate(s); });
      this.after(s.at + s.dur, () => { if (this.running) this.deactivate(s); });
    }

    this.after(NPC_SHOW_AT, () => { if (this.running) this.type('igcNpcBubble', NPC_TEXT); });
    // No auto-loop — plays once. Use replay() to restart.
  }

  /** Restart the animation from scratch (replay button). */
  replay(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    this.running = true;
    this.cycle();
  }
}
