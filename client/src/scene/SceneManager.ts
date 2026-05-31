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
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileCubemapShader();
    
    setTimeout(() => {
      const renderTarget = pmremGenerator.fromScene(this.scene);
      this.scene.environment = renderTarget.texture;
      this.scene.environmentIntensity = 0.15;
      pmremGenerator.dispose();
    }, 1000);

    this.terrain = new Terrain(this.scene);
    this.water = new Water(this.scene, this.renderer);

    this.effects = new Effects(this.scene);

    window.addEventListener('resize', this.onResize.bind(this));
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
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private updateDistanceShadowCasters(delta: number): void {
    this.shadowTimer += delta;
    if (this.shadowTimer < this.SHADOW_UPDATE_INTERVAL) return;
    this.shadowTimer = 0;

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

  setPlayerPosition(x: number, z: number): void {
    this.effects.setPlayerPosition(x, z);
    this.playerX = x;
    this.playerZ = z;
    this.lighting.trackPlayer(x, z);
  }

  private playerX = 0;
  private playerZ = 0;

  tick(): number {
    const delta = this.clock.getDelta();

    this.water.update(delta, this.camera, this.playerX, this.playerZ);
    this.skybox.update(delta, this.playerX, this.playerZ);

    this.effects.update(delta);
    this.lighting.updateCelestialDiscs(this.camera.position, this.camera);
    this.updateAdaptiveQuality(delta);
    this.updateDistanceShadowCasters(delta);
    this.updateLOD();

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    return delta;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.water.dispose();
    this.skybox.dispose(this.scene);
    // Lighting, Terrain, and Effects don't have dispose methods yet.
    // They are primarily managed by the scene traversal below or are singletons.

    if (this.composer) {
      this.composer.passes.forEach(pass => {
        if ('dispose' in pass) (pass as any).dispose();
      });
    }

    this.renderer.dispose();
    this.renderer.domElement.remove();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
}
