/**
 * "Who am I" slide — a small, transparent Three.js stage rendering the speaker's
 * in-game avatar (Zaex) in high quality, slowly turning on a pedestal of light.
 *
 * Self-contained (own scene/camera/renderer) so it never touches the live world
 * backdrop. Transparent clear colour lets that backdrop show through.
 */
import * as THREE from 'three';
import { buildMesh } from '../meshes/index';
import { NPCAnimator } from '../entities/NPCAnimator';
import { createNPCMotionProfile } from '../entities/NPCMotion';

interface AvatarViewOptions {
  /** Slow turntable spin (default). Off = fixed three-quarter facing. */
  turntable?: boolean;
  /** Drive the mesh with the in-game NPCAnimator: idle bob + periodic gestures. */
  liveAnims?: boolean;
}

/** Gestures the live-anim stage cycles through, like an NPC at its post. */
const STAGE_GESTURES: ReadonlyArray<readonly [string, string?]> = [
  ['talk'],
  ['emote', 'wave'],
  ['talk'],
  ['emote', 'laugh'],
];

export class AvatarView {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pivot = new THREE.Group();
  private readonly clock = new THREE.Clock();
  private readonly ro: ResizeObserver;
  private raf = 0;
  private running = false;
  private loaded = false;
  private animator: NPCAnimator | null = null;
  private gestureCooldown = 2.5;
  private gestureIndex = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly meshId = 'npc_individual_zaex_01',
    private readonly opts: AvatarViewOptions = {},
  ) {
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);

    // Max quality: AA on, high DPR, soft shadows.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xfff0d6, 1.7);
    key.position.set(6, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7);
    rim.position.set(-7, 5, -6);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffd9a8, 0.35);
    fill.position.set(2, 3, 9);
    this.scene.add(fill);

    this.scene.add(this.pivot);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.resize();
  }

  /** Builds the avatar mesh, centres it, and frames the camera. Idempotent. */
  private load(): void {
    if (this.loaded) return;
    const obj = buildMesh(this.meshId, { position: new THREE.Vector3(), scale: 1 });
    if (!obj) return;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });

    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(centre);
    obj.position.set(-centre.x, -box.min.y, -centre.z); // feet on the ground
    this.pivot.add(obj);

    if (this.opts.liveAnims) {
      const profile = createNPCMotionProfile({ id: this.meshId, name: this.meshId, behavior: 'friendly' });
      this.animator = new NPCAnimator(obj as THREE.Group, profile);
      this.animator.setBaseY(obj.position.y);
    }
    // Fixed three-quarter facing when the turntable is off.
    if (this.opts.turntable === false) this.pivot.rotation.y = 0.35;

    // Soft contact shadow under the avatar.
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 3 + 2, size.z * 3 + 2),
      new THREE.ShadowMaterial({ opacity: 0.32 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    this.pivot.add(plane);

    // Frame a portrait-ish view, looking slightly down at the upper body.
    const h = size.y || 2;
    const dist = h * 1.9;
    this.camera.position.set(0, h * 0.62, dist);
    this.camera.lookAt(0, h * 0.5, 0);
    this.loaded = true;
  }

  start(): void {
    if (this.running) return;
    this.load();
    this.running = true;
    this.clock.start();
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.clock.stop();
  }

  dispose(): void {
    this.stop();
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.opts.turntable !== false) {
      this.pivot.rotation.y += dt * 0.5; // slow, steady turntable
    }
    if (this.animator) {
      // Idle at the post, with a gesture every few seconds — like in-game NPCs.
      this.gestureCooldown -= dt;
      if (this.gestureCooldown <= 0) {
        const [anim, emote] = STAGE_GESTURES[this.gestureIndex % STAGE_GESTURES.length];
        this.animator.play(anim, emote);
        this.gestureIndex++;
        this.gestureCooldown = 4 + Math.random() * 3;
      }
      this.animator.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };
}
