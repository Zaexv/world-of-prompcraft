import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { EntityManager } from '../entities/EntityManager';
import { WorldGenerator } from '../systems/WorldGenerator';
import { WorldBuilder } from '../systems/WorldBuilder';
import { WorldManifest } from '../state/WorldManifest';
import { getWorldHeightAt } from '../scene/VerticalTerrain';
import { Water } from '../scene/Water';
import type { WebSocketClient } from '../network/WebSocketClient';

/** A camera viewpoint for a slide — a wide vista over the procedural world. */
interface Anchor {
  pos: THREE.Vector3; // where the world streams + what we orbit
  radius: number;
  height: number;
  look: THREE.Vector3;
}

type Spec = { kind: 'vista'; x: number; z: number; radius: number; height: number };

/**
 * Live 3D backdrop for the LLMdays deck — the **real procedural world**.
 *
 * Boots {@link SceneManager} and wires the full {@link WorldGenerator} streaming
 * pipeline exactly as the game does (terrain chunk callbacks → per-biome
 * buildings, props, vegetation, monsters). Nothing decorative is injected — the
 * world is shown exactly as it is. The camera drifts very slowly so it never
 * distracts from the talk; each slide eases it to a different vista.
 */
export class Backdrop {
  private readonly sceneManager: SceneManager;
  private readonly entityManager: EntityManager;
  private readonly worldGenerator: WorldGenerator;
  private readonly anchors: Anchor[] = [];

  private readonly streamCenter = new THREE.Vector3();
  private readonly camGoal = new THREE.Vector3(0, 2.6, 26);
  private readonly look = new THREE.Vector3(0, 2.6, 0);
  private readonly lookGoal = new THREE.Vector3(0, 2.6, 0);
  private orbitAngle = 0;
  private orbitRadius = 26;
  private orbitHeight = 2.6;
  private elapsed = 0;
  private raf = 0;
  private running = false;

  // Roam mode: instead of orbiting one spot, the camera walks forward through
  // the world (slowly wandering its heading), streaming terrain as it goes.
  private roaming = false;
  private roamHeading = 0;

  // Viewpoints — a slow walk-through of the procedural world at eye level.
  // `radius` = how far the camera orbits its focus; `height` = eye height above
  // the ground (a person, not a drone). Order follows the slide sequence (deck
  // maps slide index → anchor; wraps).
  private static readonly SPECS: Spec[] = [
    { kind: 'vista', x: 0, z: 0, radius: 26, height: 2.6 },      // 1  title — establishing
    { kind: 'vista', x: 60, z: 40, radius: 24, height: 2.6 },    // 2  who am I
    { kind: 'vista', x: 120, z: 80, radius: 22, height: 2.5 },   // 3  what is it (roam)
    { kind: 'vista', x: -110, z: 70, radius: 24, height: 2.6 },  // 3  the idea
    { kind: 'vista', x: 90, z: -120, radius: 22, height: 2.5 },  // 4  architecture overview
    { kind: 'vista', x: -150, z: -40, radius: 24, height: 2.6 }, // 5  pillar 1 (3D CLI)
    { kind: 'vista', x: 160, z: 30, radius: 22, height: 2.5 },   // 6  rendering pipeline
    { kind: 'vista', x: -60, z: 150, radius: 26, height: 2.6 },  // 7  terrain / chunks
    { kind: 'vista', x: -120, z: 110, radius: 22, height: 2.5 }, // 8  pillar 2 (backend)
    { kind: 'vista', x: 100, z: -150, radius: 24, height: 2.6 }, // 9  agent graph
    { kind: 'vista', x: 130, z: -70, radius: 22, height: 2.5 },  // 10 state & memory
    { kind: 'vista', x: -130, z: -110, radius: 24, height: 2.6 },// 11 tool system
    { kind: 'vista', x: 70, z: 120, radius: 22, height: 2.5 },   // 12 concurrency & authority
    { kind: 'vista', x: -90, z: -30, radius: 24, height: 2.6 },  // 13 pillar 3 (coding)
    { kind: 'vista', x: 0, z: 0, radius: 28, height: 2.7 },      // 14 takeaways
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
    const { terrain } = this.sceneManager;
    for (const s of Backdrop.SPECS) {
      // Relocate the viewpoint to dry land if the authored point is underwater,
      // so no slide ever sits below the waterline.
      const { x, z, y } = Backdrop.nearestDry(terrain, s.x, s.z);
      this.anchors.push({
        pos: new THREE.Vector3(x, y, z),
        radius: s.radius,
        height: y + s.height,
        // Look horizontally at eye level (same height as the camera) so the
        // gaze sweeps across the scenery, not down at the ground.
        look: new THREE.Vector3(x, y + s.height, z),
      });
    }
  }

  /** Spiral-search outward for the nearest spot that is above the waterline.
   *  Falls back to the original point if nothing dry is found in range. */
  private static nearestDry(
    terrain: SceneManager['terrain'],
    x: number,
    z: number,
  ): { x: number; z: number; y: number } {
    const DRY = Water.getWaterLevel() + 0.6;
    const y0 = getWorldHeightAt(terrain, x, z);
    if (y0 >= DRY) return { x, z, y: y0 };
    // Rings of increasing radius; 12 samples per ring.
    for (let r = 12; r <= 180; r += 12) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sx = x + Math.cos(a) * r;
        const sz = z + Math.sin(a) * r;
        const sy = getWorldHeightAt(terrain, sx, sz);
        if (sy >= DRY) return { x: sx, z: sz, y: sy };
      }
    }
    return { x, z, y: Math.max(y0, DRY) }; // last resort: lift above water
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

  /** Toggle free-roam: the camera walks forward through the world (vs orbiting
   *  the current anchor). Seeds the heading from the current camera direction. */
  setRoam(on: boolean): void {
    if (on && !this.roaming) {
      // Head outward from wherever we're looking now.
      this.roamHeading = Math.atan2(
        this.lookGoal.z - this.sceneManager.camera.position.z,
        this.lookGoal.x - this.sceneManager.camera.position.x,
      );
    }
    this.roaming = on;
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

    const terrain = this.sceneManager.terrain;
    let decay: number;
    if (this.roaming) {
      // Walk forward at eye level, slowly wandering the heading — an explorer
      // crossing the world. The camera trails just behind the focus so the
      // foreground streams past. Follow faster than orbit so it doesn't lag.
      const DRY = Water.getWaterLevel() + 0.6; // stay this far above the water
      const probe = 18; // look this far ahead before committing
      const aheadX = this.streamCenter.x + Math.cos(this.roamHeading) * probe;
      const aheadZ = this.streamCenter.z + Math.sin(this.roamHeading) * probe;
      if (getWorldHeightAt(terrain, aheadX, aheadZ) < DRY) {
        // Water ahead: turn briskly toward whichever side is higher/drier.
        const lh = this.roamHeading - 0.6;
        const rh = this.roamHeading + 0.6;
        const lY = getWorldHeightAt(terrain, this.streamCenter.x + Math.cos(lh) * probe, this.streamCenter.z + Math.sin(lh) * probe);
        const rY = getWorldHeightAt(terrain, this.streamCenter.x + Math.cos(rh) * probe, this.streamCenter.z + Math.sin(rh) * probe);
        this.roamHeading += (rY >= lY ? 1 : -1) * delta * 1.8;
      } else {
        this.roamHeading += Math.sin(this.elapsed * 0.06) * delta * 0.35; // gentle wander
      }
      const dx = Math.cos(this.roamHeading);
      const dz = Math.sin(this.roamHeading);
      const speed = 7; // m/s
      // Only advance if the next step stays on dry land (never enter water).
      const nextX = this.streamCenter.x + dx * speed * delta;
      const nextZ = this.streamCenter.z + dz * speed * delta;
      const nextY = getWorldHeightAt(terrain, nextX, nextZ);
      if (nextY >= DRY) {
        this.streamCenter.x = nextX;
        this.streamCenter.z = nextZ;
        this.streamCenter.y = nextY;
      }
      const groundY = this.streamCenter.y;
      // Look ahead along the path; camera trails ~6 m behind at eye level.
      this.lookGoal.set(this.streamCenter.x + dx * 16, groundY + 2.6, this.streamCenter.z + dz * 16);
      this.camGoal.set(
        this.streamCenter.x - dx * 6,
        groundY + 2.9 + Math.sin(this.elapsed * 0.5) * 0.15,
        this.streamCenter.z - dz * 6,
      );
      decay = 0.05; // ~0.25 s time constant → tracks the moving goal
    } else {
      // Very slow orbit + faint vertical drift — calm, non-distracting. A small
      // bob (~0.25 m) reads as a gentle stroll at eye level, not a flying drone.
      this.orbitAngle += delta * 0.012;
      this.camGoal.set(
        this.lookGoal.x + Math.cos(this.orbitAngle) * this.orbitRadius,
        this.orbitHeight + Math.sin(this.elapsed * 0.12) * 0.25,
        this.lookGoal.z + Math.sin(this.orbitAngle) * this.orbitRadius,
      );
      decay = 0.55; // long time constant — gentle glide
    }

    // Glide toward the goal pose.
    const k = 1 - Math.pow(decay, delta);
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
