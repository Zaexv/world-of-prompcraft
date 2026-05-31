import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { DebugInfo } from './DebugInfo';

const CULL_DIST_SQ = 300 * 300;

export class WorldDebugOverlay {
  private css2d: CSS2DRenderer;
  private labels: CSS2DObject[] = [];
  private hoverPanel: HTMLDivElement;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-9999, -9999);
  private _enabled = false;
  private _bbox = new THREE.Box3();
  private _bboxSize = new THREE.Vector3();

  constructor(
    private container: HTMLElement,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.css2d = new CSS2DRenderer();
    this.css2d.setSize(container.clientWidth, container.clientHeight);
    Object.assign(this.css2d.domElement.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none', display: 'none',
    } as CSSStyleDeclaration);
    container.appendChild(this.css2d.domElement);

    this.hoverPanel = document.createElement('div');
    Object.assign(this.hoverPanel.style, {
      position: 'fixed', padding: '8px 12px', background: 'rgba(0,0,0,0.78)',
      color: '#cce8ff', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.7',
      borderRadius: '6px', border: '1px solid rgba(80,160,255,0.5)',
      pointerEvents: 'none', display: 'none', zIndex: '9999', whiteSpace: 'pre',
    } as CSSStyleDeclaration);
    container.appendChild(this.hoverPanel);

    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('resize', this._onResize);
  }

  get isEnabled(): boolean { return this._enabled; }

  toggle(): void {
    this._enabled = !this._enabled;
    this.css2d.domElement.style.display = this._enabled ? 'block' : 'none';
    if (this._enabled) {
      this._buildLabels();
    } else {
      this._clearLabels();
      this.hoverPanel.style.display = 'none';
    }
  }

  /** Call once per frame from GameEngine.animate() after all system updates. */
  update(playerPos: THREE.Vector3): void {
    if (!this._enabled) return;

    // Distance-cull labels
    for (const lbl of this.labels) {
      if (!lbl.parent) continue;
      const p = lbl.parent.position;
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      lbl.visible = dx * dx + dz * dz <= CULL_DIST_SQ;
    }

    // Hover detection
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets = this.labels.filter(l => l.visible && l.parent).map(l => l.parent!);
    const hits = this.raycaster.intersectObjects(targets, true);
    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0]!.object;
      while (obj && !obj.userData.debugInfo) obj = obj.parent;
      if (obj?.userData.debugInfo) {
        this._showHover(obj, obj.userData.debugInfo as DebugInfo);
      } else {
        this.hoverPanel.style.display = 'none';
      }
    } else {
      this.hoverPanel.style.display = 'none';
    }

    this.css2d.render(this.scene, this.camera);
  }

  /** Re-scan the scene to pick up newly spawned objects. */
  refresh(): void {
    if (!this._enabled) return;
    this._clearLabels();
    this._buildLabels();
  }

  private _buildLabels(): void {
    this._clearLabels();
    this.scene.traverse((obj) => {
      const info = obj.userData.debugInfo as DebugInfo | undefined;
      if (!info) return;
      const div = document.createElement('div');
      Object.assign(div.style, {
        background: 'rgba(0,0,0,0.55)', color: '#88ccff',
        padding: '2px 6px', borderRadius: '4px',
        font: '10px monospace', whiteSpace: 'nowrap', pointerEvents: 'none',
      } as CSSStyleDeclaration);
      const p = obj.position;
      div.textContent = `${info.type}  ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
      const lbl = new CSS2DObject(div);
      lbl.position.set(0, 2.5, 0);
      obj.add(lbl);
      this.labels.push(lbl);
    });
  }

  private _showHover(obj: THREE.Object3D, info: DebugInfo): void {
    this._bbox.setFromObject(obj);
    this._bbox.getSize(this._bboxSize);
    const p = obj.position;
    const lines = [
      info.type,
      `category: ${info.category}`,
      info.zone  ? `zone:     ${info.zone}`  : '',
      info.label ? `label:    ${info.label}` : '',
      `pos:      ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
      `bbox:     ${this._bboxSize.x.toFixed(1)} × ${this._bboxSize.y.toFixed(1)} × ${this._bboxSize.z.toFixed(1)}`,
    ].filter(Boolean).join('\n');
    this.hoverPanel.textContent = lines;
    this.hoverPanel.style.display = 'block';
  }

  private _clearLabels(): void {
    for (const lbl of this.labels) lbl.parent?.remove(lbl);
    this.labels = [];
  }

  private _onMouseMove = (e: MouseEvent): void => {
    const r = this.container.getBoundingClientRect();
    this.mouse.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    if (this._enabled && this.hoverPanel.style.display === 'block') {
      this.hoverPanel.style.left = `${e.clientX + 16}px`;
      this.hoverPanel.style.top  = `${e.clientY - 8}px`;
    }
  };

  private _onResize = (): void => {
    this.css2d.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  dispose(): void {
    this._clearLabels();
    this.css2d.domElement.remove();
    this.hoverPanel.remove();
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('resize', this._onResize);
  }
}
