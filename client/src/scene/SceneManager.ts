import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Terrain } from './Terrain';
import { Skybox } from './Skybox';
import { Lighting } from './Lighting';
import { Water } from './Water';
import { Buildings } from './Buildings';
import { Vegetation } from './Vegetation';
import { Effects } from './Effects';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public terrain: Terrain;
  public buildings: Buildings;
  public vegetation: Vegetation;

  private clock: THREE.Clock;
  private water: Water;
  private effects: Effects;
  private composer: EffectComposer | null = null;

  constructor(container: HTMLElement) {
    // --- Core renderer setup ---
    this.scene = new THREE.Scene();

    // Deep purple fallback background in case skybox hasn't loaded
    this.scene.background = new THREE.Color(0x0a0612);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(0, 30, 60);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.6;
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
      const bloomPass = new UnrealBloomPass(
        bloomRes,
        0.35,  // strength — subtle overall bloom
        0.5,   // radius — soft spread
        0.8,   // threshold — only bright/emissive elements bloom
      );
      this.composer.addPass(bloomPass);
    } catch {
      // Fallback: if post-processing fails, render normally
      this.composer = null;
    }

    // --- World systems (order matters: lighting first, then geometry) ---
    new Skybox(this.scene);
    new Lighting(this.scene);

    this.terrain = new Terrain(this.scene);
    this.water = new Water(this.scene);

    this.buildings = new Buildings(this.scene, this.terrain);
    this.vegetation = new Vegetation(this.scene, this.terrain, this.buildings.footprints);

    // --- Magical environmental effects (wisps, particles, glow, leaves) ---
    this.effects = new Effects(this.scene);

    // --- Resize handling ---
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
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

    // Use post-processing composer if available, otherwise fall back to direct render
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    return delta;
  }
}
