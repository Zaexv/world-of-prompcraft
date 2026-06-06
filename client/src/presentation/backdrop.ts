import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { EntityManager } from '../entities/EntityManager';
import { WorldGenerator } from '../systems/WorldGenerator';
import { WorldBuilder } from '../systems/WorldBuilder';
import { WorldManifest } from '../state/WorldManifest';
import { getWorldHeightAt } from '../scene/VerticalTerrain';
import { buildMesh } from '../meshes/index';
import type { WebSocketClient } from '../network/WebSocketClient';

/** A camera viewpoint for a slide. Either a wide vista over the procedural
 *  world, or a gentle frame on one of the two named NPCs. */
interface Anchor {
  pos: THREE.Vector3; // where the world streams + what we orbit
  radius: number;
  height: number;
  look: THREE.Vector3;
}

type Spec =
  | { kind: 'vista'; x: number; z: number; radius: number; height: number }
  | { kind: 'npc'; type: string; x: number; z: number };

/**
 * Live 3D backdrop for the LLMdays deck — the **real procedural world**.
 *
 * Boots {@link SceneManager} and wires the full {@link WorldGenerator} streaming
 * pipeline exactly as the game does (terrain chunk callbacks → per-biome
 * buildings, props, vegetation, monsters). Nothing decorative is injected except
 * the two requested characters — **Nireg Jenkins** and **El Tito** — placed as
 * points of interest. The camera drifts very slowly so it never distracts from
 * the talk; each slide eases it to a different viewpoint.
 */
export class Backdrop {
  private readonly sceneManager: SceneManager;
  private readonly entityManager: EntityManager;
  private readonly worldGenerator: WorldGenerator;
  private readonly anchors: Anchor[] = [];

  private readonly streamCenter = new THREE.Vector3();
  private readonly camGoal = new THREE.Vector3(0, 70, 130);
  private readonly look = new THREE.Vector3(0, 6, 0);
  private readonly lookGoal = new THREE.Vector3(0, 6, 0);
  private orbitAngle = 0;
  private orbitRadius = 130;
  private orbitHeight = 70;
  private elapsed = 0;
  private raf = 0;
  private running = false;

  // Viewpoints — wide vistas over the procedural world + the two NPCs.
  // Order follows the slide sequence (deck maps slide index → anchor; wraps).
  private static readonly SPECS: Spec[] = [
    { kind: 'vista', x: 0, z: 0, radius: 155, height: 90 },      // 1  title — establishing
    { kind: 'vista', x: 120, z: 80, radius: 130, height: 70 },   // 2  what is it
    { kind: 'vista', x: -110, z: 70, radius: 125, height: 66 },  // 3  the idea
    { kind: 'vista', x: 90, z: -120, radius: 140, height: 80 },  // 4  architecture overview
    { kind: 'vista', x: -150, z: -40, radius: 120, height: 64 }, // 5  pillar 1 (3D CLI)
    { kind: 'vista', x: 160, z: 30, radius: 130, height: 72 },   // 6  rendering pipeline
    { kind: 'vista', x: -60, z: 150, radius: 145, height: 78 },  // 7  terrain / chunks
    { kind: 'npc', type: 'npc_individual_eltito_01', x: -20, z: 16 },     // 8  pillar 2 (backend)
    { kind: 'npc', type: 'npc_individual_nireg_jenkins', x: 24, z: -18 }, // 9  agent graph
    { kind: 'vista', x: 130, z: -70, radius: 120, height: 66 },  // 10 state & memory
    { kind: 'vista', x: -130, z: -110, radius: 125, height: 68 },// 11 tool system
    { kind: 'vista', x: 70, z: 120, radius: 130, height: 70 },   // 12 concurrency & authority
    { kind: 'vista', x: -90, z: -30, radius: 120, height: 64 },  // 13 pillar 3 (coding)
    { kind: 'vista', x: 0, z: 0, radius: 165, height: 96 },      // 14 takeaways — wide
  ];

  constructor(container: HTMLElement) {
    this.sceneManager = new SceneManager(container);
    this.sceneManager.scene.background = new THREE.Color(0x6f9fc8);

    const { scene, terrain } = this.sceneManager;
    this.entityManager = new EntityManager(scene);

    // --- Full procedural world, wired exactly like GameBootstrapper ---
    const worldManifest = new WorldManifest();
    terrain.setManifest(worldManifest.toData());

    const worldBuilder = new WorldBuilder(scene, terrain);
    this.worldGenerator = new WorldGenerator(
      scene,
      terrain,
      this.entityManager,
      null as unknown as WebSocketClient, // ws unused by the generator
    );
    this.worldGenerator.setWorldManifest(worldManifest);
    this.worldGenerator.setWorldBuilder(worldBuilder);
    this.worldGenerator.setExclusionFootprints([]);

    // Terrain chunk lifecycle drives procedural population.
    terrain.onChunkLoaded = (cx, cz, wx, wz) => this.worldGenerator.onChunkLoaded(cx, cz, wx, wz);
    terrain.onChunkUnloaded = (cx, cz) => this.worldGenerator.onChunkUnloaded(cx, cz);
    terrain.init(); // preload chunks around origin → first spawns happen now

    this.buildAnchors();
    this.focus(0);
  }

  /** Builds viewpoints; places the two NPC characters on the terrain. */
  private buildAnchors(): void {
    const { scene, terrain } = this.sceneManager;
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();

    for (const s of Backdrop.SPECS) {
      const y = getWorldHeightAt(terrain, s.x, s.z);
      if (s.kind === 'vista') {
        this.anchors.push({
          pos: new THREE.Vector3(s.x, y, s.z),
          radius: s.radius,
          height: y + s.height,
          look: new THREE.Vector3(s.x, y + 6, s.z),
        });
        continue;
      }
      // NPC: build the real catalog character and frame it closely.
      const obj = buildMesh(s.type, { position: new THREE.Vector3(s.x, y, s.z), scale: 2.2 });
      if (obj) scene.add(obj);
      const maxDim = obj
        ? (() => {
            const box = new THREE.Box3().setFromObject(obj);
            box.getSize(size);
            box.getCenter(centre);
            return Math.max(size.x, size.y, size.z) || 6;
          })()
        : 6;
      this.anchors.push({
        pos: new THREE.Vector3(s.x, y, s.z),
        radius: Math.max(10, maxDim * 2.6),
        height: y + Math.max(4, maxDim * 1.1),
        look: obj ? centre.clone() : new THREE.Vector3(s.x, y + 3, s.z),
      });
    }
  }

  /** Number of viewpoints (deck maps slides onto these). */
  get anchorCount(): number {
    return this.anchors.length;
  }

  /** Eases the camera to viewpoint `index` and re-centres world streaming. */
  focus(index: number): void {
    if (this.anchors.length === 0) return;
    const n = this.anchors.length;
    const a = this.anchors[((index % n) + n) % n];
    this.orbitRadius = a.radius;
    this.orbitHeight = a.height;
    this.lookGoal.copy(a.look);
    this.streamCenter.copy(a.pos);
    this.orbitAngle = Math.atan2(
      this.sceneManager.camera.position.z - a.pos.z,
      this.sceneManager.camera.position.x - a.pos.x,
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const delta = Math.min(this.sceneManager.tick(), 0.05);
    this.elapsed += delta;

    // Very slow orbit + faint vertical drift — calm, non-distracting.
    this.orbitAngle += delta * 0.012;
    this.camGoal.set(
      this.lookGoal.x + Math.cos(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight + Math.sin(this.elapsed * 0.12) * 1.2,
      this.lookGoal.z + Math.sin(this.orbitAngle) * this.orbitRadius,
    );

    // Gentle, slow glide toward the goal pose (long time constant).
    const k = 1 - Math.pow(0.55, delta);
    const cam = this.sceneManager.camera;
    cam.position.lerp(this.camGoal, k);
    this.look.lerp(this.lookGoal, k);
    cam.lookAt(this.look);

    // Stream + populate the real world around the focus; animate entities.
    const px = this.streamCenter.x;
    const pz = this.streamCenter.z;
    this.sceneManager.terrain.update(px, pz);
    this.worldGenerator.update(px, pz);
    this.sceneManager.setPlayerPosition(px, pz);
    this.entityManager.update(delta, (x, z) => getWorldHeightAt(this.sceneManager.terrain, x, z));
  };
}
