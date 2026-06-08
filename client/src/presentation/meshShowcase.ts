/**
 * Slide-2 mesh showcase — a small, transparent Three.js stage that cycles
 * through real catalog meshes (El Tito, a cortijo, the mage tower, the
 * alcázaba…), each materialising with a glow ring and spinning slowly. A fake
 * prompt is "typed" above each mesh to suggest the world is being conjured on
 * demand.
 *
 * Self-contained (its own scene/camera/renderer) so it never touches the live
 * world backdrop. Transparent clear colour lets that backdrop show through.
 */
import * as THREE from 'three';
import { buildMesh } from '../meshes/index';

interface ShowItem {
  id: string;
  prompt: string;
}

// Real catalog ids (verified against the MeshRegistry) + the line we pretend a
// player typed to summon each one.
const ITEMS: ShowItem[] = [
  { id: 'npc_individual_eltito_01', prompt: 'summon El Tito, keeper of the village' },
  { id: 'malaka_cortijo', prompt: 'build a whitewashed cortijo' },
  { id: 'mage_tower', prompt: 'raise a mage tower wreathed in arcane light' },
  { id: 'malaka_castle', prompt: 'fortify the hill with an alcázaba' },
  { id: 'biome_obsidian_spire', prompt: 'forge an obsidian spire' },
  { id: 'biome_elven_tower', prompt: 'grow a silver elven tower' },
  { id: 'ancient_tree', prompt: 'plant an ancient tree, older than the realm' },
  { id: 'malaka_church', prompt: 'consecrate a stone church' },
];

// Phase timings (seconds) per item.
const TYPE = 1.3; // prompt types in
const SPAWN = 0.7; // mesh scales/glows in
const HOLD = 2.6; // slow spin
const OUT = 0.45; // mesh scales out
const TOTAL = TYPE + SPAWN + HOLD + OUT;

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeIn = (t: number): number => t * t;

export class MeshShowcase {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pivot = new THREE.Group(); // spins; holds the current mesh
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly clock = new THREE.Clock();
  private readonly ro: ResizeObserver;

  private current: THREE.Object3D | null = null;
  private fitScale = 1; // scale that fits the mesh to the view
  private index = -1;
  private phaseT = TOTAL; // start past the end → first frame loads item 0
  private typed = -1; // last char count pushed to the prompt element
  private raf = 0;
  private running = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly promptEl: HTMLElement,
  ) {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 2000);
    this.camera.position.set(0, 0, 10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0); // transparent → world shows behind
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffe9c8, 1.5);
    key.position.set(8, 14, 10);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.45);
    fill.position.set(-10, 6, -8);
    this.scene.add(fill);

    this.scene.add(this.pivot);

    // Expanding glow ring used as the "materialise" flash.
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xe8b84b,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 64), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.resize();
  }

  start(): void {
    if (this.running) return;
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
    this.clearCurrent();
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

  private clearCurrent(): void {
    if (!this.current) return;
    this.pivot.remove(this.current);
    this.current.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.current = null;
  }

  /** Loads `ITEMS[i]`: builds the mesh, centres it, and computes a fit scale. */
  private loadItem(i: number): void {
    this.clearCurrent();
    const item = ITEMS[i];
    const obj = buildMesh(item.id, { position: new THREE.Vector3(), scale: 1 });
    if (!obj) return;

    // Centre the mesh on the pivot's origin and sit it on the ground plane.
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(centre);
    obj.position.set(-centre.x, -box.min.y, -centre.z);

    const wrap = new THREE.Group();
    wrap.add(obj);
    this.pivot.add(wrap);
    this.current = wrap;

    // Fit: frame the mesh to ~3.4 world units tall in the camera.
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    this.fitScale = 3.4 / maxDim;
    // Drop the camera so it looks slightly down at the piece, centred on its mid.
    const half = (size.y * this.fitScale) / 2;
    this.camera.position.set(0, half + 1.2, 9);
    this.camera.lookAt(0, half, 0);
    this.ring.position.y = 0.02;

    // Reset the typed prompt.
    this.promptEl.textContent = '';
    this.typed = -1;
  }

  private typePrompt(prompt: string, p: number): void {
    const n = Math.min(prompt.length, Math.floor(easeIn(p) * prompt.length * 1.05));
    if (n === this.typed) return;
    this.typed = n;
    this.promptEl.textContent = prompt.slice(0, n);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.phaseT += dt;

    if (this.phaseT >= TOTAL) {
      this.phaseT = 0;
      this.index = (this.index + 1) % ITEMS.length;
      this.loadItem(this.index);
    }

    const t = this.phaseT;
    const item = ITEMS[this.index];

    // 1) Type the prompt.
    this.typePrompt(item.prompt, Math.min(1, t / TYPE));

    // 2/3/4) Mesh scale envelope + glow ring.
    let scale = 0;
    let ringP = -1;
    if (t < TYPE) {
      scale = 0;
    } else if (t < TYPE + SPAWN) {
      const p = (t - TYPE) / SPAWN;
      scale = easeOutBack(p);
      ringP = p;
    } else if (t < TYPE + SPAWN + HOLD) {
      scale = 1;
    } else {
      const p = (t - TYPE - SPAWN - HOLD) / OUT;
      scale = 1 - easeIn(p);
    }

    if (this.current) {
      const s = Math.max(0, scale) * this.fitScale;
      this.current.scale.setScalar(s);
    }
    // Glow ring expands + fades during spawn.
    if (ringP >= 0) {
      const r = 0.6 + ringP * 4.2;
      this.ring.scale.setScalar(r);
      this.ringMat.opacity = (1 - ringP) * 0.8;
    } else {
      this.ringMat.opacity *= 0.85; // settle to invisible
    }

    // Slow continuous spin.
    this.pivot.rotation.y += dt * 0.55;

    this.renderer.render(this.scene, this.camera);
  };
}
