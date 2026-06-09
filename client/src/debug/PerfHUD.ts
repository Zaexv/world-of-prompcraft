import * as THREE from 'three';

/** A frame slower than this is logged. */
const FPS_LOG_THRESHOLD = 20;
const SLOW_FRAME_MS = 1000 / FPS_LOG_THRESHOLD; // 50ms
/** Group slow frames into one console line per this window (avoid flooding). */
const LOG_WINDOW_SEC = 0.5;

interface PerfContext {
  collidables: number;
  npcs: number;
  sceneChildren: number;
  x: number;
  z: number;
  zone: string;
}

/**
 * Lightweight performance HUD + slow-frame logger.
 *
 * - F4 toggles a live on-screen HUD (draw calls, triangles, GPU memory, counts).
 * - Logs to the browser console whenever a frame drops below FPS_LOG_THRESHOLD,
 *   but ONLY after the HUD has been toggled on at least once.
 *
 * Stats reflect total frame work because SceneManager sets
 * `renderer.info.autoReset = false` and resets once per frame.
 */
export class PerfHUD {
  private panel: HTMLDivElement;
  private enabled = false;
  private hasToggled = false;

  // Rolling frame-time average for a stable FPS readout.
  private avgMs = 16.67;
  private accum = 0;
  private samples = 0;
  private sinceUpdate = 0;
  private worstMs = 0;

  // Slow-frame logging window state.
  private lastTs = performance.now(); // for TRUE frame time (delta is clamped upstream)
  private logWindow = 0;
  private slowCount = 0;
  private worstSlowMs = 0;
  private worstSnap: (PerfContext & { draws: number; tris: number; progs: number }) | null = null;
  private windowStartProgs = -1; // shader program count at window start → detect compiles

  // Shader-program diagnostics: identify WHICH parameter forces recompiles.
  private progPrimed = false;
  private knownProgKeys = new Set<string>();
  private baselineKey: string | null = null; // a representative key captured at prime
  private windowNovelTokens = new Map<string, number>(); // token → #new programs carrying it
  private windowNewProgs = 0;
  private dumpedPair = false; // console banner once; window.__perfKeys keeps accumulating
  private allFreshKeys: string[] = []; // every new key seen this session (for window.__perfKeys)

  constructor(
    container: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly counts: () => PerfContext,
  ) {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'absolute', top: '8px', left: '8px',
      padding: '8px 12px', background: 'rgba(0,0,0,0.72)',
      color: '#aef0c0', font: '12px/1.55 monospace', whiteSpace: 'pre',
      borderRadius: '6px', border: '1px solid rgba(80,255,160,0.4)',
      pointerEvents: 'none', display: 'none', zIndex: '10000',
    } as CSSStyleDeclaration);
    container.appendChild(this.panel);
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.hasToggled = true;
    this.panel.style.display = this.enabled ? 'block' : 'none';
    this.worstMs = 0;
  }

  /** Call once per frame after rendering (delta in seconds; clamped upstream). */
  update(delta: number): void {
    // TRUE frame time — GameEngine clamps `delta` to 0.1s, hiding spikes >100ms.
    const now = performance.now();
    const ms = now - this.lastTs;
    this.lastTs = now;

    if (!this.hasToggled) return;

    const programs = (this.renderer.info.programs ?? []) as Array<{ cacheKey?: string }>;
    const progs = programs.length;
    if (this.windowStartProgs < 0) this.windowStartProgs = progs;

    // Track new shader-program cache keys. Tokens are diffed against a frozen
    // baseline (the program set present at prime) so the *distinctive* parameter
    // of each recompiled variant surfaces — light count, map, flatShading, etc.
    if (!this.progPrimed) {
      for (const p of programs) {
        if (!p.cacheKey) continue;
        this.knownProgKeys.add(p.cacheKey);
        if (!this.baselineKey) this.baselineKey = p.cacheKey;
      }
      this.progPrimed = true;
    } else {
      const baseTokens = this.baselineKey ? new Set(this.baselineKey.split(',')) : new Set<string>();
      const freshKeys: string[] = [];
      for (const p of programs) {
        const k = p.cacheKey;
        if (!k || this.knownProgKeys.has(k)) continue;
        this.knownProgKeys.add(k);
        this.windowNewProgs++;
        freshKeys.push(k);
        for (const t of k.split(',')) {
          if (!baseTokens.has(t)) {
            this.windowNovelTokens.set(t, (this.windowNovelTokens.get(t) ?? 0) + 1);
          }
        }
      }
      // Accumulate EVERY new key across the session so late recompiles (reaching
      // a new zone/biome) are captured, not just the first batch. `copy(window
      // .__perfKeys)` in the console always reflects the full set. The yellow
      // console banner stays one-shot to avoid spamming the log.
      if (freshKeys.length > 0 && this.baselineKey) {
        for (const k of freshKeys) this.allFreshKeys.push(k);
        const payload = {
          baseline: this.baselineKey,
          fresh: this.allFreshKeys,
        };
        (window as unknown as { __perfKeys?: unknown }).__perfKeys = payload;
        if (!this.dumpedPair) {
          this.dumpedPair = true;
          console.warn(
            '%c=== SHADER KEY DUMP (live — copy(window.__perfKeys) after triggering a spike) ===',
            'color:#ff0;font-weight:bold',
          );
          console.warn(JSON.stringify({ baseline: this.baselineKey, fresh: freshKeys.slice(0, 4) }, null, 2));
        }
      }
    }

    // ── Slow-frame logging (always on) ─────────────────────────────────────
    if (ms > SLOW_FRAME_MS) {
      this.slowCount++;
      if (ms > this.worstSlowMs) {
        this.worstSlowMs = ms;
        const info = this.renderer.info;
        this.worstSnap = {
          ...this.counts(),
          draws: info.render.calls,
          tris: info.render.triangles,
          progs,
        };
      }
    }
    this.logWindow += ms / 1000;
    if (this.logWindow >= LOG_WINDOW_SEC) {
      if (this.slowCount > 0 && this.worstSnap) {
        const s = this.worstSnap;
        const newProgs = s.progs - this.windowStartProgs; // shaders compiled this window
        console.warn(
          `[perf] dip ${(1000 / this.worstSlowMs).toFixed(0)}fps (${this.worstSlowMs.toFixed(0)}ms) · ` +
          `${this.slowCount} slow · ` +
          `+${newProgs} shaders (${s.progs} total) · ` +
          `draws ${s.draws} · tris ${s.tris.toLocaleString()} · ` +
          `collid ${s.collidables} · npcs ${s.npcs} · ` +
          `zone "${s.zone}" @ ${s.x.toFixed(0)},${s.z.toFixed(0)}`,
        );
        if (this.windowNovelTokens.size > 0) {
          const top = [...this.windowNovelTokens.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([t, c]) => `${t}×${c}`)
            .join('  ');
          console.warn(`[perf]   ↳ ${this.windowNewProgs} new programs · novel tokens: ${top}`);
        }
      }
      this.logWindow = 0;
      this.slowCount = 0;
      this.worstSlowMs = 0;
      this.worstSnap = null;
      this.windowStartProgs = progs;
      this.windowNovelTokens.clear();
      this.windowNewProgs = 0;
    }

    // ── Live on-screen HUD (only when toggled on) ──────────────────────────
    if (!this.enabled) return;

    this.accum += ms;
    this.samples++;
    if (ms > this.worstMs) this.worstMs = ms;

    this.sinceUpdate += delta;
    if (this.sinceUpdate < 0.25) return; // refresh text 4×/s
    this.sinceUpdate = 0;

    this.avgMs = this.accum / Math.max(1, this.samples);
    this.accum = 0;
    this.samples = 0;

    const info = this.renderer.info;
    const c = this.counts();
    const fps = (1000 / this.avgMs).toFixed(0);

    this.panel.textContent =
      `FPS    ${fps}  (${this.avgMs.toFixed(1)}ms, peak ${this.worstMs.toFixed(1)}ms)\n` +
      `draws  ${info.render.calls}\n` +
      `tris   ${info.render.triangles.toLocaleString()}\n` +
      `geom   ${info.memory.geometries}   tex ${info.memory.textures}\n` +
      `progs  ${info.programs?.length ?? 0}\n` +
      `collid ${c.collidables}   npcs ${c.npcs}\n` +
      `zone   ${c.zone}\n` +
      `scene  ${c.sceneChildren} top-level`;

    this.worstMs = 0; // reset peak each readout window
  }

  dispose(): void {
    this.panel.remove();
  }
}
