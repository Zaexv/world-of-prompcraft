/**
 * Entry point for the LLMdays presentation (Vite entry: src/presentation/index.html).
 *
 * Boots the reused game world as a live backdrop, then the slide controller.
 * Each slide flies the camera to a different real object. A failed WebGL
 * context must never block the slides, so the backdrop is guarded.
 */
import './styles.css';
import { Backdrop } from './backdrop';
import { initDeck, renderDiagrams } from './deck';
import { MeshShowcase } from './meshShowcase';
import { AvatarView } from './avatarView';

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

// Slide-2 mesh showcase (prompt → live mesh). Only runs while slide 2 is on
// screen so it never competes with the world backdrop for the GPU.
const SHOWCASE_SLIDE = 2; // 0-based index of the "What is it?" slide
let showcase: MeshShowcase | null = null;
const stageEl = document.getElementById('meshStage');
const promptEl = document.getElementById('showcasePrompt');
if (stageEl && promptEl) {
  try {
    showcase = new MeshShowcase(stageEl, promptEl);
  } catch (err) {
    console.warn('Mesh showcase unavailable:', err);
  }
}

// "Who am I" slide — the speaker's 3D in-game avatar (Zaex).
const AVATAR_SLIDE = 1;
let avatar: AvatarView | null = null;
const avatarEl = document.getElementById('avatarStage');
if (avatarEl) {
  try {
    avatar = new AvatarView(avatarEl);
  } catch (err) {
    console.warn('Avatar view unavailable:', err);
  }
}

// Map each slide onto a focus anchor; later slides wrap across the lineup.
initDeck((index) => {
  if (backdrop && backdrop.anchorCount > 0) backdrop.focus(index % backdrop.anchorCount);
  // Slide 2 explores the world (camera walks forward); every other slide orbits.
  backdrop?.setRoam(index === SHOWCASE_SLIDE);
  if (showcase) {
    if (index === SHOWCASE_SLIDE) showcase.start();
    else showcase.stop();
  }
  if (avatar) {
    if (index === AVATAR_SLIDE) avatar.start();
    else avatar.stop();
  }
});
