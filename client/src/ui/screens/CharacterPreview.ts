import * as THREE from 'three';
import { buildRaceModel } from '../../entities/RaceModels';
import { applyCharacterPBR } from '../../utils/PBRMaps';

/**
 * Self-contained 3D character preview for the login screen.
 *
 * Renders a single procedural race model on a transparent canvas (so the Dark
 * Portal backdrop shows through), slowly auto-rotating with simple 3-point
 * lighting. The model matches the in-game look via buildRaceModel + applyCharacterPBR.
 */
export class CharacterPreview {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly modelRoot: THREE.Group;
  private current: THREE.Object3D | null = null;

  private running = false;
  private animationId = 0;
  private lastTime = 0;

  constructor(width = 340, height = 460) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      width: `${width}px`,
      height: `${height}px`,
      display: 'block',
    } as CSSStyleDeclaration);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    // Model spans roughly y=0..2.25; frame it head-to-toe, slight downward look.
    this.camera.position.set(0, 1.5, 5.2);
    this.camera.lookAt(0, 1.1, 0);

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);

    // 3-point lighting so the procedural model reads well on the dark portal.
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.9);
    fill.position.set(-4, 2, 2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xc5a55a, 1.4);
    rim.position.set(0, 3, -5);
    this.scene.add(rim);

    this.scene.add(new THREE.AmbientLight(0x404a66, 1.0));
  }

  /** Swap the previewed race model, disposing the previous one. */
  setRace(race: string): void {
    if (this.current) {
      this.modelRoot.remove(this.current);
      this.disposeObject(this.current);
      this.current = null;
    }

    const model = buildRaceModel(race);
    applyCharacterPBR(model);
    this.modelRoot.add(model);
    this.current = model;
  }

  /** Begin the render loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick();
  }

  /** Stop rendering and release all GPU resources. */
  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.animationId);
    if (this.current) {
      this.disposeObject(this.current);
      this.current = null;
    }
    this.renderer.dispose();
  }

  private tick = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.modelRoot.rotation.y += delta * 0.6;
    this.renderer.render(this.scene, this.camera);
    this.animationId = requestAnimationFrame(this.tick);
  };

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          for (const material of child.material) material.dispose();
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
