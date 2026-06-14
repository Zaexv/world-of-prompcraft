/**
 * Benchmark runner — an automated, server-free FPS stress tour that runs on the
 * REAL game engine. It boots the same way the game does (SceneManager render
 * pipeline + full shader warmup via warmUpShaders + the procedural WorldGenerator
 * / WorldBuilder), then drives a virtual explorer through a sequence of realistic
 * scenarios while sampling every frame's true wall-clock time.
 *
 * Launched from the game itself via `index.html?benchmark` (see main.ts) — it is
 * a mode of the game, not a separate page. Reuses the engine's building blocks;
 * owns its own loop so movement can be scripted.
 */
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { EntityManager } from '../entities/EntityManager';
import { CollisionSystem } from '../systems/CollisionSystem';
import { WorldGenerator } from '../systems/WorldGenerator';
import { WorldBuilder } from '../systems/WorldBuilder';
import { WorldManifest } from '../state/WorldManifest';
import { getWorldHeightAt, setWorldManifest as setTerrainManifest } from '../scene/VerticalTerrain';
import { setWorldManifest as setBiomeManifest } from '../scene/Biomes';
import { warmUpShaders } from '../core/ShaderWarmup';
import { createLoadingOverlay } from '../ui/LoadingOverlay';
import type { NPCBehavior } from '../entities/NPCMotion';
import { BenchmarkUI } from './BenchmarkUI';
import type { FpsStats, BenchmarkReportData } from './BenchmarkUI';

// ── Tour configuration ────────────────────────────────────────────────────────
// Realistic scenarios, not synthetic dumps. The NPC target is cumulative — once
// spawned, the crowd stays for the rest of the run.

interface Phase {
  readonly id: string;
  readonly label: string;
  readonly seconds: number;
  /** Travel speed in world units/sec (drives chunk streaming). */
  readonly speed: number;
  /** Cumulative NPC-crowd target reached by the END of this phase. */
  readonly npcTarget: number;
  /** Straight-line dash (no curve) — used for the cross-biome sprint. */
  readonly straight: boolean;
}

const PHASES: readonly Phase[] = [
  { id: 'worldgen', label: 'World generation walk', seconds: 12, speed: 22, npcTarget: 0,   straight: false },
  { id: 'npcs',     label: 'NPC swarm',             seconds: 11, speed: 16, npcTarget: 400, straight: false },
  { id: 'sprint',   label: 'Cross-biome sprint',    seconds: 30, speed: 95, npcTarget: 400, straight: true  },
  { id: 'settle',   label: 'Static worst-case',     seconds: 5,  speed: 0,  npcTarget: 400, straight: false },
];

const SPAWN_BATCH = 12;
const SPAWN_INTERVAL = 0.05;
const SPAWN_RADIUS = 70;
const BEHAVIORS: readonly NPCBehavior[] = ['friendly', 'neutral', 'hostile'];

export async function runBenchmark(app: HTMLElement): Promise<void> {
  const overlay = createLoadingOverlay(app);

  // Manifest (unfetched) → base config for terrain/biomes/generator, no server.
  const worldManifest = new WorldManifest();
  setTerrainManifest(worldManifest);
  setBiomeManifest(worldManifest);

  overlay.setMessage('Initializing renderer...');
  const sceneManager = new SceneManager(app);
  const { scene, camera, terrain, renderer } = sceneManager;
  terrain.setManifest(worldManifest.toData());

  const entityManager = new EntityManager(scene);
  const collisionSystem = new CollisionSystem();
  const heightAt = (x: number, z: number): number => getWorldHeightAt(terrain, x, z);

  // Real procedural world systems — same as GameBootstrapper.
  const worldBuilder = new WorldBuilder(scene, terrain);
  worldBuilder.setCollisionSystem(collisionSystem);

  const worldGenerator = new WorldGenerator(scene, terrain, entityManager, null!);
  worldGenerator.setCollisionSystem(collisionSystem);
  worldGenerator.setWorldManifest(worldManifest);
  worldGenerator.setWorldBuilder(worldBuilder);
  worldGenerator.setExclusionFootprints([]);

  terrain.onChunkLoaded = (cx, cz, wx, wz): void => worldGenerator.onChunkLoaded(cx, cz, wx, wz);
  terrain.onChunkUnloaded = (cx, cz): void => worldGenerator.onChunkUnloaded(cx, cz);

  overlay.setMessage('Building starting area...');
  terrain.init();

  // Full shader warmup — identical to the game's load path so first-frame
  // compile stalls don't pollute the benchmark.
  overlay.setMessage('Compiling shaders...');
  await warmUpShaders(renderer, scene, camera, (f) => overlay.setProgress(f));
  overlay.hide();

  const ui = new BenchmarkUI(app);

  // ── State ──
  let npcCount = 0;
  let spawnTimer = 0;
  let px = 0;
  let pz = 0;
  let heading = 0;

  const camOffset = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  const allFrameMs: number[] = [];
  const phaseFrameMs: number[][] = PHASES.map(() => []);

  const pick = <T,>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];

  function spawnNPC(cx: number, cz: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * SPAWN_RADIUS;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    entityManager.addNPC({
      id: `bench_npc_${npcCount}`,
      name: `Bot ${npcCount}`,
      position: new THREE.Vector3(x, heightAt(x, z), z),
      behavior: pick(BEHAVIORS),
      wanderRadius: 8 + Math.random() * 12,
      hp: 100,
      maxHp: 100,
    });
    npcCount++;
  }

  function updateExplorer(delta: number, phase: Phase): void {
    if (phase.straight) {
      // Dash straight to the front (+X) as fast as possible — chunk streaming
      // is the bottleneck under test, so the camera trails directly behind.
      heading = 0;
      px += phase.speed * delta;
      const gy = heightAt(px, pz);
      camera.position.set(px - 34, gy + 20, pz);
      lookTarget.set(px + 60, gy + 4, pz);
      camera.lookAt(lookTarget);
    } else {
      heading += Math.sin(performance.now() * 0.00013) * 0.9 * delta;
      px += Math.cos(heading) * phase.speed * delta;
      pz += Math.sin(heading) * phase.speed * delta;
      // Slow chase-cam orbit so the generated world + crowd are on screen.
      const orbit = performance.now() * 0.00018;
      camOffset.set(Math.cos(orbit) * 46, 34, Math.sin(orbit) * 46);
      const gy = heightAt(px, pz);
      camera.position.set(px + camOffset.x, gy + camOffset.y, pz + camOffset.z);
      lookTarget.set(px, gy + 4, pz);
      camera.lookAt(lookTarget);
    }
  }

  // ── Loop ──
  let phaseIdx = 0;
  let phaseElapsed = 0;
  let lastTs = performance.now();
  let liveAccumMs = 0;
  let liveAccumFrames = 0;
  let liveFps = 60;
  let finished = false;

  function frame(): void {
    if (finished) return;
    requestAnimationFrame(frame);

    const delta = Math.min(sceneManager.tick(), 0.1);

    const now = performance.now();
    const trueMs = now - lastTs;
    lastTs = now;

    const phase = PHASES[phaseIdx];

    // Record (skip the very first frame — it carries first-paint cost).
    if (allFrameMs.length > 0 || phaseElapsed > 0) {
      allFrameMs.push(trueMs);
      phaseFrameMs[phaseIdx].push(trueMs);
    }

    liveAccumMs += trueMs;
    liveAccumFrames++;
    if (liveAccumMs >= 200) {
      liveFps = 1000 / (liveAccumMs / liveAccumFrames);
      liveAccumMs = 0;
      liveAccumFrames = 0;
      ui.pushFps(liveFps);
    }

    updateExplorer(delta, phase);

    terrain.update(px, pz);
    sceneManager.setPlayerPosition(px, pz);
    worldBuilder.update(px, pz);
    worldGenerator.update(px, pz); // drain procedural spawn queue → real content
    entityManager.setPlayerPosition(px, pz);
    entityManager.update(delta, heightAt, collisionSystem);
    collisionSystem.update();

    spawnTimer += delta;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      for (let i = 0; i < SPAWN_BATCH && npcCount < phase.npcTarget; i++) spawnNPC(px, pz);
    }

    ui.update({
      phaseLabel: phase.label,
      phaseIndex: phaseIdx,
      phaseCount: PHASES.length,
      phaseProgress: Math.min(1, phaseElapsed / phase.seconds),
      fps: liveFps,
      npcs: npcCount,
      draws: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      collidables: collisionSystem.getCollidableCount(),
      sceneChildren: scene.children.length,
      px,
      pz,
    });

    phaseElapsed += trueMs / 1000;
    if (phaseElapsed >= phase.seconds) {
      phaseIdx++;
      phaseElapsed = 0;
      if (phaseIdx >= PHASES.length) {
        finished = true;
        finalize();
      }
    }
  }

  function finalize(): void {
    const overall = computeStats(allFrameMs);
    const phases = PHASES.map((p, i) => ({ id: p.id, label: p.label, ...computeStats(phaseFrameMs[i]) }));
    const report: BenchmarkReportData = {
      overall,
      phases,
      scene: {
        npcs: npcCount,
        collidables: collisionSystem.getCollidableCount(),
        draws: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        sceneChildren: scene.children.length,
      },
      device: { renderer: gpuName(renderer), pixelRatio: renderer.getPixelRatio() },
    };
    (window as unknown as { __benchmarkReport: BenchmarkReportData }).__benchmarkReport = report;

    const fmt = (s: FpsStats): Record<string, string> => ({
      avg: s.avgFps.toFixed(1),
      'low 1%': s.lowOnePct.toFixed(1),
      lowest: s.minFps.toFixed(1),
      highest: s.maxFps.toFixed(1),
      median: s.medianFps.toFixed(1),
      frames: String(s.frames),
    });
    /* eslint-disable no-console */
    console.log('%c━━━ PROMPTCRAFT ENGINE BENCHMARK ━━━', 'color:#d9c187;font-weight:bold');
    console.table(Object.fromEntries([
      ['OVERALL', fmt(overall)],
      ...phases.map((p) => [p.label, fmt(p)] as const),
    ]));
    console.log(
      `Peak load: ${npcCount} NPCs · ${report.scene.collidables} collidables · ` +
      `${report.scene.draws} draws · ${report.scene.triangles.toLocaleString()} tris · ` +
      `${report.scene.sceneChildren} scene objects`,
    );
    console.log(`GPU: ${report.device.renderer} @ pixelRatio ${report.device.pixelRatio}`);
    console.log('Full data on window.__benchmarkReport');
    /* eslint-enable no-console */

    ui.showReport(report);
  }

  requestAnimationFrame(frame);
}

// ── Stats ───────────────────────────────────────────────────────────────────────

function computeStats(frameMs: readonly number[]): FpsStats {
  const frames = frameMs.length;
  if (frames === 0) return { frames: 0, avgFps: 0, minFps: 0, maxFps: 0, lowOnePct: 0, medianFps: 0 };
  let sum = 0;
  for (const ms of frameMs) sum += ms;
  const sorted = [...frameMs].sort((a, b) => a - b); // ascending ms = descending fps
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  return {
    frames,
    avgFps: 1000 / (sum / frames),
    minFps: 1000 / sorted[sorted.length - 1],
    maxFps: 1000 / sorted[0],
    lowOnePct: 1000 / at(0.99),
    medianFps: 1000 / at(0.5),
  };
}

function gpuName(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  } catch {
    return 'unknown';
  }
}
