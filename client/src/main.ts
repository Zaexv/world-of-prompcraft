import { LoginScreen } from './ui/LoginScreen';
import { bootstrap } from './core/GameBootstrapper';

// Load Cinzel font early so it's available for the login screen
if (!document.querySelector('link[href*="Cinzel"]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap';
  document.head.appendChild(link);
}

const app = document.getElementById('app')!;

const loginScreen = new LoginScreen();
loginScreen.show();

loginScreen.onEnterWorld = (username: string, race: string, faction: string, skin: string) => {
  const loadingOverlay = createLoadingOverlay(app);
  const engine = bootstrap({ username, race, faction, skin }, app, loadingOverlay, loginScreen);
  createArcaneMouseVfx();
  engine.start();
};

// ── Loading overlay ───────────────────────────────────────────────────────────

function createLoadingOverlay(container: HTMLElement): { setMessage(m: string): void; hide(): void } {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '14px',
    background: 'radial-gradient(circle at center, rgba(12,16,28,0.92), rgba(4,6,12,0.98))',
    backdropFilter: 'blur(2px)', color: '#c8d6ff',
    fontFamily: 'system-ui, sans-serif', fontSize: '16px', zIndex: '9999',
  } as CSSStyleDeclaration);

  const spinner = document.createElement('div');
  Object.assign(spinner.style, {
    width: '28px', height: '28px', border: '3px solid rgba(160, 184, 255, 0.2)',
    borderTopColor: '#9fb9ff', borderRadius: '50%',
    animation: 'promptcraft-spin 0.85s linear infinite',
  } as CSSStyleDeclaration);

  const message = document.createElement('div');
  message.textContent = 'Loading world...';
  message.style.letterSpacing = '0.3px';

  const style = document.createElement('style');
  style.textContent = `@keyframes promptcraft-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);

  overlay.appendChild(spinner);
  overlay.appendChild(message);
  container.appendChild(overlay);

  return {
    setMessage(m: string) { message.textContent = m; },
    hide() { overlay.remove(); },
  };
}

// ── Arcane cursor VFX ─────────────────────────────────────────────────────────

function createArcaneMouseVfx(): void {
  if (document.getElementById('promptcraft-game-cursor')) return;

  const style = document.createElement('style');
  style.id = 'promptcraft-hide-system-cursor';
  style.textContent = `
    html, body, #app, #app * { cursor: none !important; }
    @keyframes promptcraft-thunder-flicker {
      0%, 100% { opacity: 0.14; transform: scaleY(0.78); }
      28% { opacity: 0.86; transform: scaleY(1.08); }
      62% { opacity: 0.46; transform: scaleY(0.9); }
    }
  `;
  document.head.appendChild(style);

  const cursor = document.createElement('div');
  cursor.id = 'promptcraft-game-cursor';
  Object.assign(cursor.style, {
    position: 'fixed', left: '-100px', top: '-100px', width: '22px', height: '30px',
    pointerEvents: 'none', zIndex: '2147483647', opacity: '0',
    transform: 'translate(-20%, -6%)', willChange: 'transform, left, top, opacity',
  } as CSSStyleDeclaration);

  const pointer = document.createElement('div');
  Object.assign(pointer.style, {
    position: 'absolute', inset: '0',
    clipPath: 'polygon(0 0, 0 100%, 31% 72%, 45% 100%, 59% 93%, 45% 64%, 100% 64%)',
    background: 'linear-gradient(150deg, #cfdcff 0%, #7fa4ef 40%, #40559b 100%)',
    border: '1px solid rgba(10, 14, 30, 0.96)',
    boxShadow: '0 0 8px rgba(92, 136, 240, 0.5), 0 0 16px rgba(77, 48, 140, 0.4)',
  } as CSSStyleDeclaration);

  const pointerInner = document.createElement('div');
  Object.assign(pointerInner.style, {
    position: 'absolute', inset: '2px 3px 3px 2px',
    clipPath: 'polygon(0 0, 0 100%, 30% 72%, 45% 100%, 56% 93%, 43% 63%, 100% 63%)',
    background: 'linear-gradient(152deg, rgba(236,242,255,0.95) 0%, rgba(146,182,250,0.9) 48%, rgba(74,102,188,0.65) 100%)',
    filter: 'drop-shadow(0 0 2px rgba(160, 195, 255, 0.55))',
  } as CSSStyleDeclaration);

  const mkBolt = (left: string, top: string, h: string, delay: string, dur: string) => {
    const b = document.createElement('div');
    Object.assign(b.style, {
      position: 'absolute', left, top, width: '2px', height: h,
      background: 'linear-gradient(to bottom, rgba(170,186,255,0), rgba(170,186,255,0.9), rgba(98,124,231,0))',
      filter: 'drop-shadow(0 0 3px rgba(122, 144, 255, 0.72))',
      animation: `promptcraft-thunder-flicker ${dur} steps(2, end) infinite`,
      animationDelay: delay, transformOrigin: 'top center',
    } as CSSStyleDeclaration);
    return b;
  };

  cursor.appendChild(pointer);
  cursor.appendChild(pointerInner);
  cursor.appendChild(mkBolt('5px', '-3px', '20px', '0ms', '165ms'));
  cursor.appendChild(mkBolt('11px', '5px', '15px', '60ms', '220ms'));
  document.body.appendChild(cursor);

  let x = -100, y = -100, hiddenByLook = false;
  const show = () => { cursor.style.opacity = '1'; };
  const hide = () => { cursor.style.opacity = '0'; };

  window.addEventListener('mousemove', (e: MouseEvent) => {
    x = e.clientX; y = e.clientY;
    if (hiddenByLook) return;
    cursor.style.left = `${x}px`; cursor.style.top = `${y}px`;
    cursor.style.transform = `translate(-20%, -6%) rotate(${Math.max(-14, Math.min(14, e.movementX * 0.7))}deg)`;
    show();
  });
  window.addEventListener('mousedown', (e: MouseEvent) => { if (e.button === 0 || e.button === 2) { hiddenByLook = true; hide(); } });
  window.addEventListener('mouseup',   (e: MouseEvent) => {
    if (e.button === 0 || e.button === 2) {
      hiddenByLook = false;
      cursor.style.left = `${x}px`; cursor.style.top = `${y}px`; show();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    hiddenByLook = document.pointerLockElement !== null;
    if (hiddenByLook) { hide(); return; }
    cursor.style.left = `${x}px`; cursor.style.top = `${y}px`; show();
  });
  window.addEventListener('mouseleave', hide);
}
