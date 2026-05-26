import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Terrain } from './Terrain';
import { Skybox } from './Skybox';
import { Lighting } from './Lighting';
import { Water } from './Water';
import { Vegetation } from './Vegetation';
import { Effects } from './Effects';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public terrain: Terrain;
  public vegetation: Vegetation;
  public lighting!: Lighting;

  private clock: THREE.Clock;
  private water: Water;
  private effects: Effects;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
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

  constructor(container: HTMLElement) {
    // --- Core renderer setup ---
    this.scene = new THREE.Scene();

    // Deep purple fallback background in case skybox hasn't loaded
    this.scene.background = new THREE.Color(0x0a0612);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1600,
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

    // --- Post-processing bloom (makes wisps, mushrooms, runes glow) ---
    try {
      this.composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      // Half-resolution bloom for performance
      const bloomRes = new THREE.Vector2(
        Math.floor(window.innerWidth / 2),
        Math.floor(window.innerHeight / 2),
      );
      this.bloomPass = new UnrealBloomPass(
        bloomRes,
        0.22,  // lower strength keeps scene cooler/darker
        0.35,  // tighter spread to avoid haze
        0.9,   // bloom only on truly bright emissive elements
      );
      this.composer.addPass(this.bloomPass);
    } catch {
      // Fallback: if post-processing fails, render normally
      this.composer = null;
      this.bloomPass = null;
    }

    // --- World systems (order matters: lighting first, then geometry) ---
    new Skybox(this.scene);
    this.lighting = new Lighting(this.scene);

    this.terrain = new Terrain(this.scene);
    this.water = new Water(this.scene);

    // Vegetation now only needs terrain (footprints will come from WorldManifest later)
    this.vegetation = new Vegetation(this.scene, this.terrain, []);

    // --- Magical environmental effects (wisps, particles, glow, leaves) ---
    this.effects = new Effects(this.scene);

    // --- Resize handling ---
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
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    if (this.bloomPass) {
      if (this.frameTimeMs > 22 && this.bloomPass.enabled) {
        this.bloomPass.enabled = false;
      } else if (this.frameTimeMs < 16 && !this.bloomPass.enabled) {
        this.bloomPass.enabled = true;
      }
    }
  }

  private updateDistanceShadowCasters(delta: number): void {
    this.shadowTimer += delta;
    if (this.shadowTimer < this.SHADOW_UPDATE_INTERVAL) return;
    this.shadowTimer = 0;

    let changed = false;
    for (const obj of this.scene.children) {
      obj.traverse((child) => {
        if (!child.userData.distanceShadowCaster) return;
        if (!(child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh)) return;

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
      });
    }

    if (changed) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  /** Update player position for effects and water tracking. */
  setPlayerPosition(x: number, z: number): void {
    this.effects.setPlayerPosition(x, z);
    this.playerX = x;
    this.playerZ = z;
  }

  private playerX = 0;
  private playerZ = 0;

  tick(): number {
    const delta = this.clock.getDelta();

    this.water.update(delta, this.playerX, this.playerZ);

    this.effects.update(delta);
    this.updateAdaptiveQuality(delta);
    this.updateDistanceShadowCasters(delta);

    // Use post-processing composer if available, otherwise fall back to direct render
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    return delta;
  }
}
