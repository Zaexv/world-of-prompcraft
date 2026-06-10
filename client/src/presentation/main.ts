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
import { AgentAnimation } from './agentAnimation';

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
const ENDLESS_SLIDE = 8; // cinematic "living world" slide — also roams the world
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

// "Why Three.js" slide — a second showcase, framed as Coding Agents authoring
// brand-new meshes from a prompt.
const AGENT_SHOWCASE_SLIDE = 7;
let agentShowcase: MeshShowcase | null = null;
const stageEl2 = document.getElementById('meshStage2');
const promptEl2 = document.getElementById('showcasePrompt2');
if (stageEl2 && promptEl2) {
  try {
    agentShowcase = new MeshShowcase(stageEl2, promptEl2, [
      { id: 'mage_tower', prompt: 'agent: code a mage tower mesh class' },
      { id: 'malaka_church', prompt: 'agent: generate a stone church' },
      { id: 'biome_obsidian_spire', prompt: 'agent: new biome prop — obsidian spire' },
      { id: 'malaka_cortijo', prompt: 'agent: build a whitewashed cortijo' },
      { id: 'biome_elven_tower', prompt: 'agent: author an elven tower' },
      { id: 'ancient_tree', prompt: 'agent: add an ancient tree to the catalog' },
    ]);
  } catch (err) {
    console.warn('Agent showcase unavailable:', err);
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

// Slide-11 NPC view — Paco el Churrero, to accompany the agent trace demo.
const NPC_SLIDE = 10; // 0-based
let npcView11: AvatarView | null = null;
const npcStageEl = document.getElementById('npcStage11');
if (npcStageEl) {
  try {
    npcView11 = new AvatarView(npcStageEl, 'npc_individual_churrero_malaka_01');
  } catch (err) {
    console.warn('NPC view unavailable:', err);
  }
}

const agentAnim = new AgentAnimation();
document.getElementById('agentReplayBtn')?.addEventListener('click', () => {
  agentAnim.replay();
});

// Map each slide onto a focus anchor; later slides wrap across the lineup.
initDeck((index) => {
  if (backdrop && backdrop.anchorCount > 0) backdrop.focus(index % backdrop.anchorCount);
  // The "What is it?" and cinematic "endless land" slides fly over the world;
  // every other slide gently orbits its anchor.
  if (index === ENDLESS_SLIDE) {
    // Fly straight east through Fort Malaka (bounds x:-300→-100, z:-350→-150)
    // from a point just west of the fort, at cinematic altitude.
    backdrop?.setRoam(true, 15, { x: -80, z: -250 }, Math.PI, 35);
  } else if (index === SHOWCASE_SLIDE) {
    backdrop?.setRoam(true, 34); // normal wandering roam for mesh showcase
  } else {
    backdrop?.setRoam(false);
  }
  if (showcase) {
    if (index === SHOWCASE_SLIDE) showcase.start();
    else showcase.stop();
  }
  if (agentShowcase) {
    if (index === AGENT_SHOWCASE_SLIDE) agentShowcase.start();
    else agentShowcase.stop();
  }
  if (avatar) {
    if (index === AVATAR_SLIDE) avatar.start();
    else avatar.stop();
  }
  if (npcView11) {
    if (index === NPC_SLIDE) npcView11.start();
    else npcView11.stop();
  }
  if (index === NPC_SLIDE) agentAnim.start();
  else agentAnim.stop();
});
