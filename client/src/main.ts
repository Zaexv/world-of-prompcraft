import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { LoginScreen } from './ui/LoginScreen';
import { bootstrap } from './core/GameBootstrapper';

// Monkey-patch THREE with BVH support
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

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

loginScreen.onEnterWorld = (username: string, race: string, faction: string) => {
  const loadingOverlay = createLoadingOverlay(app);
  void bootstrap({ username, race, faction }, app, loadingOverlay, loginScreen).then((engine) => {
    engine.start();
  });
};

// ── Loading overlay ───────────────────────────────────────────────────────────

function createLoadingOverlay(
  container: HTMLElement,
): { setMessage(m: string): void; setProgress(f: number): void; hide(): void } {
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

  // Shader-compilation progress bar — fills as warmUpShaders compiles each batch.
  const barTrack = document.createElement('div');
  Object.assign(barTrack.style, {
    width: '240px', height: '6px', borderRadius: '3px',
    background: 'rgba(160, 184, 255, 0.15)', overflow: 'hidden',
  } as CSSStyleDeclaration);

  const barFill = document.createElement('div');
  Object.assign(barFill.style, {
    width: '0%', height: '100%', borderRadius: '3px',
    background: 'linear-gradient(90deg, #6f8cff, #9fb9ff)',
    transition: 'width 0.15s ease-out',
  } as CSSStyleDeclaration);
  barTrack.appendChild(barFill);

  const style = document.createElement('style');
  style.textContent = `@keyframes promptcraft-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);

  overlay.appendChild(spinner);
  overlay.appendChild(message);
  overlay.appendChild(barTrack);
  container.appendChild(overlay);

  return {
    setMessage(m: string) { message.textContent = m; },
    setProgress(f: number) {
      const pct = Math.max(0, Math.min(1, f)) * 100;
      barFill.style.width = `${pct.toFixed(1)}%`;
    },
    hide() { overlay.remove(); },
  };
}

