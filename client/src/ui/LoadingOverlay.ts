/**
 * Shared loading overlay — the spinner + shader-compilation progress bar shown
 * while the world boots. Used by both the normal game bootstrap and the
 * benchmark mode so they present an identical load experience.
 */
export interface LoadingOverlay {
  setMessage(m: string): void;
  setProgress(f: number): void;
  hide(): void;
}

export function createLoadingOverlay(container: HTMLElement): LoadingOverlay {
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

  if (!document.getElementById('promptcraft-spin-style')) {
    const style = document.createElement('style');
    style.id = 'promptcraft-spin-style';
    style.textContent = `@keyframes promptcraft-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

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
