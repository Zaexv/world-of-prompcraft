import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { TemporalAAPass } from './TemporalAAPass';
import { Terrain } from './Terrain';
import { Skybox } from './Skybox';
import { Lighting } from './Lighting';
import { Water } from './Water';
import { Effects } from './Effects';
import { StartingForest } from './Forest';
import { DesertScenery } from './Desert';
import type { CollisionSystem } from '../systems/CollisionSystem';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public terrain: Terrain;
  public lighting!: Lighting;

  private clock: THREE.Clock;
  private water: Water;
  private effects: Effects;
  private skybox: Skybox;
  private composer: EffectComposer | null = null;
  private forest: StartingForest;
  private desert: DesertScenery;
  private dynamicPixelRatio: number;
  private maxPixelRatio: number;
  private readonly minPixelRatio = 0.9;
  private frameTimeMs = 16.67;
  private perfTimer = 0;
  private shadowTimer = 0;
  private readonly PERF_UPDATE_INTERVAL = 0.5;
  private readonly SHADOW_UPDATE_INTERVAL = 0.3;
  private readonly DEFAULT_SHADOW_DISTANCE = 42;
  private readonly _tmpShadowPos = new THREE.Vector3();
  // Cached scene-object lists — rebuilt periodically to avoid per-frame traversal.
  private _lodObjects: THREE.LOD[] = [];
  private _shadowCasters: Array<THREE.Mesh | THREE.InstancedMesh> = [];
  private _lodCacheFrame = 0;
  private _shadowCacheFrame = 0;
  private readonly CACHE_REBUILD_FRAMES = 120; // ~2 s at 60 fps

  constructor(container: HTMLElement) {
    // --- Core renderer setup ---
    this.scene = new THREE.Scene();

    this.scene.background = new THREE.Color(0x88d0ff); // Even lighter, more vibrant

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2500,
    );
    this.camera.position.set(0, 30, 60);
    this.camera.lookAt(0, 0, 0);

    this.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.dynamicPixelRatio = this.maxPixelRatio;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.dynamicPixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.55; // Further increased exposure for maximum brightness
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    // --- World systems (order matters: lighting first, then geometry) ---
    this.skybox = new Skybox(this.scene);
    this.lighting = new Lighting(this.scene);

    // --- Post-processing: render → TAA → bloom ---
    // No SSAO/ambient-occlusion pass: it was removed for performance (it cost a
    // full-scene depth/normal prepass plus per-pixel AO + denoise every frame).
    // Indirect/ambient shading comes from the cheap PMREM environment map
    // generated below.
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      // 1. TAA
      this.composer.addPass(new TemporalAAPass(window.innerWidth, window.innerHeight, 5));

      // 2. Bloom
      const bloomRes = new THREE.Vector2(
        Math.floor(window.innerWidth / 2),
        Math.floor(window.innerHeight / 2),
      );
      this.composer.addPass(new UnrealBloomPass(
        bloomRes,
        0.22,
        0.35,
        0.9,
      ));
    } catch (e) {
      console.warn('Post-processing failed to initialize:', e);
      this.composer = null;
    }

    // --- Environment Lighting (IBL) ---
    // Use PMREM to generate a performant indirect lighting map from the skybox.
    // This provides the 'real life' ground bounce by letting materials reflect
    // the sky and terrain colors.
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileCubemapShader();
    
    // We'll update the environment map whenever the skybox or biome changes
    // significantly. For now, a one-time high-quality generation.
    setTimeout(() => {
      const renderTarget = pmremGenerator.fromScene(this.scene);
      this.scene.environment = renderTarget.texture;
      // The captured environment is dominated by the saturated blue sky
      // (0x88d0ff). At full strength it casts a cold blue reflection over every
      // material (trees, characters, buildings — everything except the terrain,
      // which opts out with envMapIntensity:0) and overpowers the warm sun.
      // Keep it as a subtle indirect-light fill, not the dominant term.
      this.scene.environmentIntensity = 0.15;
      pmremGenerator.dispose();
    }, 1000);

    this.terrain = new Terrain(this.scene);
    this.water = new Water(this.scene, this.renderer);

    this.effects = new Effects(this.scene);
    this.forest = new StartingForest(this.scene, this.terrain);
    this.desert = new DesertScenery(this.scene, this.terrain);

    window.addEventListener('resize', this.onResize.bind(this));
  }

  setCollisionSystem(collisionSystem: CollisionSystem): void {
    this.forest.setCollisionSystem(collisionSystem);
    this.desert.setCollisionSystem(collisionSystem);
  }

  private onResize(): void {
    this.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.dynamicPixelRatio = Math.min(this.dynamicPixelRatio, this.maxPixelRatio);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.dynamicPixelRatio);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
      // composer.setSize propagates to TemporalAAPass.setSize, which resets history.
    }
  }

  private updateAdaptiveQuality(delta: number): void {
    const frameMs = delta * 1000;
    this.frameTimeMs = THREE.MathUtils.lerp(this.frameTimeMs, frameMs, 0.1);
    this.perfTimer += delta;
    if (this.perfTimer < this.PERF_UPDATE_INTERVAL) return;
    this.perfTimer = 0;

    let nextRatio = this.dynamicPixelRatio;
    if (this.frameTimeMs > 20) {
      nextRatio = Math.max(this.minPixelRatio, this.dynamicPixelRatio - 0.1);
    } else if (this.frameTimeMs < 14) {
      nextRatio = Math.min(this.maxPixelRatio, this.dynamicPixelRatio + 0.05);
    }

    if (Math.abs(nextRatio - this.dynamicPixelRatio) < 0.01) return;
    this.dynamicPixelRatio = nextRatio;
    this.renderer.setPixelRatio(this.dynamicPixelRatio);
    // Only resize the renderer drawing buffer — skipping composer.setSize avoids
    // resetting the TAA history (which causes a dark flash) and GPU pipeline stalls.
    // The composer targets stay at the previous logical size; the minor mismatch
    // is imperceptible compared to the artifacts it prevents.
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private updateDistanceShadowCasters(delta: number): void {
    this.shadowTimer += delta;
    if (this.shadowTimer < this.SHADOW_UPDATE_INTERVAL) return;
    this.shadowTimer = 0;

    // Rebuild shadow-caster cache every ~2 s (objects are static after world gen).
    if (++this._shadowCacheFrame >= this.CACHE_REBUILD_FRAMES) {
      this._shadowCacheFrame = 0;
      this._shadowCasters = [];
      this.scene.traverse((child) => {
        if (child.userData.distanceShadowCaster &&
            (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh)) {
          this._shadowCasters.push(child as THREE.Mesh | THREE.InstancedMesh);
        }
      });
    }

    let changed = false;
    for (const child of this._shadowCasters) {
      child.getWorldPosition(this._tmpShadowPos);
      const dx = this._tmpShadowPos.x - this.playerX;
      const dz = this._tmpShadowPos.z - this.playerZ;
      const shadowDistance = typeof child.userData.shadowDistance === 'number'
        ? child.userData.shadowDistance
        : this.DEFAULT_SHADOW_DISTANCE;
      const shouldCast = (dx * dx + dz * dz) <= shadowDistance * shadowDistance;
      if (child.castShadow !== shouldCast) {
        child.castShadow = shouldCast;
        changed = true;
      }
    }

    if (changed) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private updateLOD(): void {
    // Rebuild LOD list every ~2 s — LOD objects are static after world gen.
    if (++this._lodCacheFrame >= this.CACHE_REBUILD_FRAMES) {
      this._lodCacheFrame = 0;
      this._lodObjects = [];
      this.scene.traverse((obj) => {
        if (obj.type === 'LOD') this._lodObjects.push(obj as THREE.LOD);
      });
    }
    for (const lod of this._lodObjects) {
      lod.update(this.camera);
    }
  }

  /** Update player position for effects, water, and shadow frustum tracking. */
  setPlayerPosition(x: number, z: number): void {
    this.effects.setPlayerPosition(x, z);
    this.desert.setPlayerPosition(x, z);
    this.playerX = x;
    this.playerZ = z;
    this.lighting.trackPlayer(x, z);
  }

  private playerX = 0;
  private playerZ = 0;

  tick(): number {
    const delta = this.clock.getDelta();

    this.water.update(delta, this.camera);
    this.skybox.update(delta, this.playerX, this.playerZ);

    this.forest.update(delta);
    this.desert.update(delta);
    this.effects.update(delta);
    this.lighting.updateCelestialDiscs(this.camera.position, this.camera);
    this.updateAdaptiveQuality(delta);
    this.updateDistanceShadowCasters(delta);
    this.updateLOD();

    // Use post-processing composer if available, otherwise fall back to direct render
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    return delta;
  }
}
