/**
 * Slide controller for the LLMdays deck — navigation, Mermaid rendering, and
 * pan/zoom for the architecture diagrams.
 *
 * Kept free of 3D concerns (see backdrop.ts) and of markup (see
 * index.html). Mermaid is loaded as a global by a CDN <script> in the
 * HTML so the TypeScript build stays dependency-free; we describe only the tiny
 * surface we call.
 */

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  run(opts: { querySelector: string }): Promise<void>;
}

/** Per-slide callback (e.g. fly the 3D camera to a matching object). */
export type SlideListener = (index: number) => void;

// Mermaid v11 ships an ESM bundle (the IIFE `min.js` does not expose a global).
// Load it at runtime via a variable specifier so tsc/Vite leave it untouched.
const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

async function loadMermaid(): Promise<MermaidApi | null> {
  try {
    const mod = (await import(/* @vite-ignore */ MERMAID_URL)) as { default: MermaidApi };
    return mod.default;
  } catch (err) {
    console.warn('Mermaid failed to load:', err);
    return null;
  }
}

/** Render the Mermaid blocks in the game palette, then wire pan/zoom. */
export async function renderDiagrams(): Promise<void> {
  const mermaid = await loadMermaid();
  if (!mermaid) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'loose',
    flowchart: { curve: 'basis', padding: 14, nodeSpacing: 36, rankSpacing: 44 },
    themeVariables: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '14px',
      background: 'transparent',
      primaryColor: '#1a1320',
      primaryBorderColor: '#d4b369',
      primaryTextColor: '#f4ecdd',
      lineColor: '#d4b369',
      secondaryColor: '#241a2c',
      tertiaryColor: '#15101c',
    },
  });
  // Mermaid lays out using each container's width — but inactive slides are
  // display:none (width 0 → NaN layout). Force every slide to lay out
  // (transparent, non-interactive) just for the render pass, then restore.
  const slides = [...document.querySelectorAll<HTMLElement>('.slide')];
  const saved = slides.map((s) => s.getAttribute('style') ?? '');
  slides.forEach((s) => {
    s.style.display = 'flex';
    s.style.opacity = '0';
    s.style.pointerEvents = 'none';
  });
  try {
    await mermaid.run({ querySelector: '.mermaid' });
  } catch (err) {
    console.warn('Mermaid render failed:', err);
  } finally {
    slides.forEach((s, i) => s.setAttribute('style', saved[i]));
  }
  document.querySelectorAll<HTMLElement>('.diagram').forEach(enablePanZoom);
}

/** Drag to pan, wheel to zoom, double-click to reset — on a rendered diagram. */
function enablePanZoom(view: HTMLElement): void {
  const svg = view.querySelector('svg');
  if (!svg) return;

  // Mermaid emits width="100%" and no height; absolutely-positioned that
  // collapses to 0×0. Size the SVG explicitly from its viewBox so it has a
  // stable intrinsic size we can fit/pan/zoom deterministically.
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const vbW = vb[2] && vb[2] > 0 ? vb[2] : 300;
  const vbH = vb[3] && vb[3] > 0 ? vb[3] : 300;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = `${vbW}px`;
  svg.style.height = `${vbH}px`;
  svg.style.maxWidth = 'none';
  svg.style.transformOrigin = '0 0';
  svg.style.cursor = 'grab';

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let sx = 0;
  let sy = 0;

  const apply = (): void => {
    svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  // Fit the diagram inside the viewport and centre it.
  const fit = (): void => {
    const vw = view.clientWidth;
    const vh = view.clientHeight;
    if (vw === 0 || vh === 0) return; // slide still hidden
    scale = Math.min(vw / vbW, vh / vbH) * 0.92;
    tx = (vw - vbW * scale) / 2;
    ty = (vh - vbH * scale) / 2;
    apply();
  };
  // Diagrams live on hidden slides (display:none → zero size) at render time.
  // Re-fit as soon as the slide becomes visible (and on window resize).
  const ro = new ResizeObserver(() => fit());
  ro.observe(view);

  view.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const rect = view.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      // Zoom toward the cursor.
      tx = ox - (ox - tx) * factor;
      ty = oy - (oy - ty) * factor;
      scale = Math.min(6, Math.max(0.4, scale * factor));
      apply();
    },
    { passive: false },
  );

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true;
    sx = e.clientX - tx;
    sy = e.clientY - ty;
    svg.style.cursor = 'grabbing';
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    tx = e.clientX - sx;
    ty = e.clientY - sy;
    apply();
  });
  const end = (): void => {
    dragging = false;
    svg.style.cursor = 'grab';
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  view.addEventListener('dblclick', fit);
}

/** Wires keyboard / scroll / click navigation; notifies `onSlide` on change. */
export function initDeck(onSlide?: SlideListener): void {
  const slides = [...document.querySelectorAll<HTMLElement>('.slide')];
  const bar = document.getElementById('progress');
  const cur = document.getElementById('cur');
  const total = document.getElementById('total');
  const help = document.getElementById('help');
  if (!bar || !cur || !total || slides.length === 0) return;
  total.textContent = String(slides.length);

  let index = -1;
  const show = (n: number): void => {
    const next = Math.max(0, Math.min(slides.length - 1, n));
    if (next === index) return;
    index = next;
    slides.forEach((s, k) => s.classList.toggle('active', k === index));
    bar.style.width = `${((index + 1) / slides.length) * 100}%`;
    cur.textContent = String(index + 1);
    location.hash = String(index + 1);
    onSlide?.(index);
  };
  const next = (): void => show(index + 1);
  const prev = (): void => show(index - 1);

  const toggleHelp = (force?: boolean): void => {
    if (!help) return;
    const open = force ?? help.hasAttribute('hidden');
    if (open) help.removeAttribute('hidden');
    else help.setAttribute('hidden', '');
  };
  help?.addEventListener('click', () => toggleHelp(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === '?' || e.key.toLowerCase() === 'h') {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (e.key === 'Escape' && help && !help.hasAttribute('hidden')) {
      e.preventDefault();
      toggleHelp(false);
      return;
    }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      next();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      prev();
    } else if (e.key === 'Home') {
      show(0);
    } else if (e.key === 'End') {
      show(slides.length - 1);
    } else if (e.key.toLowerCase() === 'f') {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
      else void document.exitFullscreen();
    }
  });

  // Scroll / trackpad — debounced so one gesture moves exactly one slide.
  // Ignored while hovering a diagram (wheel there means zoom).
  let lock = false;
  window.addEventListener(
    'wheel',
    (e) => {
      if ((e.target as HTMLElement).closest('.diagram')) return;
      if (lock || Math.abs(e.deltaY) < 12) return;
      lock = true;
      if (e.deltaY > 0) next();
      else prev();
      window.setTimeout(() => {
        lock = false;
      }, 650);
    },
    { passive: true },
  );

  // Click the far left / right edge to page (ignore links + diagram drags).
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a') || t.closest('.diagram')) return;
    if (e.clientX < window.innerWidth * 0.22) prev();
    else if (e.clientX > window.innerWidth * 0.78) next();
  });

  // Deep-link via hash, e.g. /src/presentation/#5 — on load and on change.
  window.addEventListener('hashchange', () => {
    const n = parseInt(location.hash.slice(1), 10) - 1;
    if (Number.isInteger(n) && n >= 0) show(n);
  });
  const start = parseInt(location.hash.slice(1), 10) - 1;
  show(Number.isInteger(start) && start >= 0 ? start : 0);
}
