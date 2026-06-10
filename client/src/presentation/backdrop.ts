import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { EntityManager } from '../entities/EntityManager';
import { WorldGenerator } from '../systems/WorldGenerator';
import { WorldBuilder } from '../systems/WorldBuilder';
import { WorldManifest } from '../state/WorldManifest';
import { getWorldHeightAt } from '../scene/VerticalTerrain';
import { Water } from '../scene/Water';
import { warmUpShaders } from '../core/ShaderWarmup';
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
  // When set, the camera flies in a fixed straight line (no drift, no water avoidance).
  private roamFixedHeading: number | null = null;
  private roamSpeed = 17; // m/s

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
    { kind: 'vista', x: -40, z: -150, radius: 26, height: 2.6 }, // 5  three pillars
    { kind: 'vista', x: -150, z: -40, radius: 24, height: 2.6 }, // 6  pillar 1 (3D CLI)
    { kind: 'vista', x: 40, z: -90, radius: 24, height: 2.6 },   // 6  why three.js (agent showcase)
    { kind: 'vista', x: 160, z: 30, radius: 22, height: 2.5 },   // 7  rendering pipeline
    // Pillars 2 + 3 hold one vista: the mage tower in the Blasted Suarezlands
    // (manifest landmark at ~(460, 100)) — the camera stays put for the whole arc.
    { kind: 'vista', x: 460, z: 100, radius: 38, height: 3.0 },  // 10 backend arch — mage tower
    { kind: 'vista', x: 460, z: 100, radius: 38, height: 3.0 },  // 11 agent in action
    { kind: 'vista', x: 460, z: 100, radius: 38, height: 3.0 },  // 12 state graph
    { kind: 'vista', x: 460, z: 100, radius: 38, height: 3.0 },  // 13 PoC transcript
    { kind: 'vista', x: 460, z: 100, radius: 38, height: 3.0 },  // 14 pillar 3 (coding)
    { kind: 'vista', x: 460, z: 100, radius: 38, height: 3.0 },  // 15 process deep dive
    { kind: 'vista', x: 460, z: 100, radius: 38, height: 3.0 },  // 16 plans deep dive
    { kind: 'vista', x: 70, z: 120, radius: 22, height: 2.5 },   // 17 contributors
    { kind: 'vista', x: -90, z: -30, radius: 24, height: 2.6 },  // 18 thanks
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

  /**
   * Pre-compile every shader program up front — same fix the game uses in
   * GameBootstrapper. Without it, each new mesh/biome type the camera streams past
   * compiles its program synchronously on first render (100–600ms stalls that read
   * as stutters mid-slide). SceneManager already has lights + a synchronous PMREM
   * env in scene, so the right variants warm. Await this behind a loading overlay
   * BEFORE {@link start} so the audience never sees the compile stutter; the
   * optional `onProgress` (0→1) drives that overlay's progress bar.
   */
  async warmUp(onProgress?: (fraction: number) => void): Promise<void> {
    await warmUpShaders(
      this.sceneManager.renderer,
      this.sceneManager.scene,
      this.sceneManager.camera,
      onProgress,
    );
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

  private roamAltitude = 34; // camera height above ground during roam

  /** Toggle free-roam: the camera walks forward through the world (vs orbiting
   *  the current anchor). Seeds the heading from the current camera direction.
   *  @param startPos  Optional world-space XZ to teleport streamCenter to on start.
   *  @param fixedHeading  When set, fly in a straight line at this heading (radians,
   *                       no drift, no water-avoidance steering).
   */
  setRoam(
    on: boolean,
    altitude = 34,
    startPos?: { x: number; z: number },
    fixedHeading?: number,
    speed = 17,
  ): void {
    if (on && !this.roaming) {
      if (startPos) {
        const y = Backdrop.nearestDry(this.sceneManager.terrain, startPos.x, startPos.z).y;
        this.streamCenter.set(startPos.x, y, startPos.z);
        this.lookGoal.set(startPos.x, y + altitude, startPos.z);
      }
      this.roamHeading = fixedHeading ?? Math.atan2(
        this.lookGoal.z - this.sceneManager.camera.position.z,
        this.lookGoal.x - this.sceneManager.camera.position.x,
      );
    }
    this.roamAltitude = altitude;
    this.roamSpeed = speed;
    this.roamFixedHeading = on && fixedHeading !== undefined ? fixedHeading : null;
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
      // Fly over the world at a steady rhythm — high enough that viewers see the
      // procedural terrain, biomes and LLM-built buildings scroll past. Each
      // frame we pick a heading that is guaranteed dry ahead, so the camera can
      // never get stuck (the current spot is dry → at worst it turns back).
      const DRY = Water.getWaterLevel() + 0.6; // keep land below us, not open sea
      const LOOK = 26; // commit distance for the dryness test (matches the speed)
      const dryAt = (h: number): boolean =>
        getWorldHeightAt(
          terrain,
          this.streamCenter.x + Math.cos(h) * LOOK,
          this.streamCenter.z + Math.sin(h) * LOOK,
        ) >= DRY;

      if (this.roamFixedHeading !== null) {
        // Fixed straight-line flight — no drift, no water-avoidance steering.
        this.roamHeading = this.roamFixedHeading;
      } else {
        // Preferred heading: keep going straight with a faint drift.
        const desired = this.roamHeading + Math.sin(this.elapsed * 0.05) * delta * 0.1;
        let target = desired;
        if (!dryAt(desired)) {
          // Scan outward (alternating sides) for the nearest dry heading.
          for (let off = 0.2; off <= Math.PI + 0.001; off += 0.2) {
            if (dryAt(desired + off)) { target = desired + off; break; }
            if (dryAt(desired - off)) { target = desired - off; break; }
          }
        }
        // Ease the heading toward the target (capped turn rate → smooth turns).
        let diff = target - this.roamHeading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to [-π, π]
        const maxTurn = 2.4 * delta;
        this.roamHeading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      }

      // Step forward along the current heading.
      const dx = Math.cos(this.roamHeading);
      const dz = Math.sin(this.roamHeading);
      const speed = this.roamSpeed;
      this.streamCenter.x += dx * speed * delta;
      this.streamCenter.z += dz * speed * delta;
      this.streamCenter.y = getWorldHeightAt(terrain, this.streamCenter.x, this.streamCenter.z);

      const groundY = this.streamCenter.y;
      const FLY = this.roamAltitude; // camera altitude above the ground
      const hx = Math.cos(this.roamHeading);
      const hz = Math.sin(this.roamHeading);
      // Aim well ahead and lower than the camera → a gentle downward flyover gaze.
      this.lookGoal.set(this.streamCenter.x + hx * 44, groundY + 8, this.streamCenter.z + hz * 44);
      this.camGoal.set(
        this.streamCenter.x - hx * 14,
        groundY + FLY + Math.sin(this.elapsed * 0.35) * 0.8,
        this.streamCenter.z - hz * 14,
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
    this.entityManager.setPlayerPosition(px, pz);
    this.entityManager.update(delta, (x, z) => getWorldHeightAt(this.sceneManager.terrain, x, z));
  };
}
