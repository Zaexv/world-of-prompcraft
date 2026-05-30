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

    this.scene.background = new THREE.Color(0x87ceeb);

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
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    // --- Post-processing: render → TAA → bloom ---
    try {
      this.composer = new EffectComposer(this.renderer);

      this.composer.addPass(new RenderPass(this.scene, this.camera));

      // Exponential-blend TAA: blends each frame with the last ~5 frames.
      // composer.setSize() propagates to TemporalAAPass.setSize(), which
      // discards stale history on resize automatically.
      this.composer.addPass(new TemporalAAPass(window.innerWidth, window.innerHeight, 5));

      // Half-resolution bloom for performance
      const bloomRes = new THREE.Vector2(
        Math.floor(window.innerWidth / 2),
        Math.floor(window.innerHeight / 2),
      );
      this.composer.addPass(new UnrealBloomPass(
        bloomRes,
        0.22,  // lower strength keeps scene cooler/darker
        0.35,  // tighter spread to avoid haze
        0.9,   // bloom only on truly bright emissive elements
      ));
    } catch {
      // Fallback: if post-processing fails, render normally
      this.composer = null;
    }

    // --- World systems (order matters: lighting first, then geometry) ---
    this.skybox = new Skybox(this.scene);
    this.lighting = new Lighting(this.scene);

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
    this.water = new Water(this.scene);

    // --- Magical environmental effects (wisps, particles, glow, leaves) ---
    this.effects = new Effects(this.scene);
    this.forest = new StartingForest(this.scene, this.terrain);

    // --- Resize handling ---
    window.addEventListener('resize', this.onResize.bind(this));
  }

  setCollisionSystem(collisionSystem: CollisionSystem): void {
    this.forest.setCollisionSystem(collisionSystem);
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
    }
  }

  public update(): void {
    const delta = this.clock.getDelta();
    this.frameTimeMs = delta * 1000;

    // Tick world systems
    this.terrain.update(delta);
    this.water.update(delta);
    this.effects.update(delta);
    this.lighting.update(delta);
    this.skybox.update(delta);

    // Update culling/LOD
    this._updateDynamicCulling(delta);
    this._updateShadowQuality(delta);

    // Render
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Performance-aware culling: Adjust resolution scaling and LOD based on frametime.
   */
  private _updateDynamicCulling(delta: number): void {
    this.perfTimer += delta;
    if (this.perfTimer < this.PERF_UPDATE_INTERVAL) return;
    this.perfTimer = 0;

    const targetFrameTime = 16.67; // 60 FPS
    if (this.frameTimeMs > targetFrameTime + 4) {
      // Lagging: drop resolution slightly
      this.dynamicPixelRatio = Math.max(this.minPixelRatio, this.dynamicPixelRatio - 0.05);
      this.renderer.setPixelRatio(this.dynamicPixelRatio);
    } else if (this.frameTimeMs < targetFrameTime - 2) {
      // Running smoothly: increase resolution
      this.dynamicPixelRatio = Math.min(this.maxPixelRatio, this.dynamicPixelRatio + 0.05);
      this.renderer.setPixelRatio(this.dynamicPixelRatio);
    }
  }

  /**
   * Shadow quality management: Tighten shadow camera around the player and update infrequently.
   */
  private _updateShadowQuality(delta: number): void {
    this.shadowTimer += delta;
    if (this.shadowTimer < this.SHADOW_UPDATE_INTERVAL) return;
    this.shadowTimer = 0;

    // Follow player with shadow camera
    this._tmpShadowPos.set(this.camera.position.x, 0, this.camera.position.z);
    this.lighting.updateShadowCamera(this._tmpShadowPos, this.DEFAULT_SHADOW_DISTANCE);
  }

  /** Helper to rebuild mesh caches for external systems (e.g. raycasting). */
  public getObjectMeshes(): THREE.Object3D[] {
    // Rebuild cache if stale (every 2 seconds)
    if (Math.abs(this._lodCacheFrame - Date.now()) > 2000) {
      this._rebuildCaches();
    }
    return this._meshesCache;
  }

  private _meshesCache: THREE.Object3D[] = [];
  private _rebuildCaches(): void {
    this._meshesCache = [];
    this.scene.traverse((obj) => {
      if (obj.type === 'Mesh' || obj.type === 'InstancedMesh') {
        this._meshesCache.push(obj);
      }
    });
    this._lodCacheFrame = Date.now();
  }
}
