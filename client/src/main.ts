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

loginScreen.onEnterWorld = (username: string, race: string, faction: string, skin: string) => {
  const loadingOverlay = createLoadingOverlay(app);
  const engine = bootstrap({ username, race, faction, skin }, app, loadingOverlay, loginScreen);
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

