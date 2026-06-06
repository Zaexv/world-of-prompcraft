/**
 * Entry point for the LLMdays presentation (Vite entry: presentation.html).
 *
 * Boots the reused game world as a live backdrop, then the slide controller.
 * Each slide flies the camera to a different real object. A failed WebGL
 * context must never block the slides, so the backdrop is guarded.
 */
import './styles.css';
import { Backdrop } from './backdrop';
import { initDeck, renderDiagrams } from './deck';

let backdrop: Backdrop | null = null;
const bg = document.getElementById('bg');
if (bg) {
  try {
    backdrop = new Backdrop(bg);
    backdrop.start();
  } catch (err) {
    console.warn('3D backdrop unavailable — slides will run without it:', err);
  }
}

void renderDiagrams();

// Map each slide onto a focus anchor; later slides wrap across the lineup.
initDeck((index) => {
  if (!backdrop || backdrop.anchorCount === 0) return;
  backdrop.focus(index % backdrop.anchorCount);
});
