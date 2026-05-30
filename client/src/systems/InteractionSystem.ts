import * as THREE from 'three';
import { EntityManager } from '../entities/EntityManager';

/**
 * Handles raycaster-based NPC interaction (click) and hover highlighting.
 *
 * - Left-click selects/interacts with NPCs when it was a click (not a camera drag).
 * - Hover highlights NPCs while the cursor is over them.
 * - Left/right mouse drag are reserved for camera orbit (WoW-style controls).
 */
export class InteractionSystem {
  /** Set this callback to be notified when an NPC is clicked. */
  public onNPCClick: ((npcId: string, npcName: string) => void) | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private entityManager: EntityManager;
  private hoveredNpcId: string | null = null;
  // Cached bounding rect — invalidated on resize to avoid per-mousemove layout reads.
  private _cachedRect: DOMRect | null = null;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    entityManager: EntityManager,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.entityManager = entityManager;

    // Left-click interaction
    this.domElement.addEventListener('click', (e: MouseEvent) => {
      if (this.wasCameraDrag()) return;
      this.handleClick(e);
    });

    // Hover
    this.domElement.addEventListener('mousemove', (e: MouseEvent) => {
      // Suppress hover raycasts while mouse-drag camera orbit is active.
      if ((e.buttons & 3) !== 0) {
        this.clearHighlight();
        return;
      }
      this.handleHover(e);
    });

    // Invalidate cached rect when the canvas moves or resizes.
    window.addEventListener('resize', () => { this._cachedRect = null; });
  }

  // ----------------------------------------------------------------

  private wasCameraDrag(): boolean {
    if (this.domElement.dataset.cameraDrag === '1') return true;
    const ts = Number(this.domElement.dataset.justCameraDragged ?? '0');
    return Number.isFinite(ts) && ts > 0 && (performance.now() - ts) < 140;
  }

  // ----------------------------------------------------------------

  private setMouseFromEvent(e: MouseEvent): void {
    if (!this._cachedRect) this._cachedRect = this.domElement.getBoundingClientRect();
    const rect = this._cachedRect;
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycast(): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const targets = this.entityManager.getMeshes();
    // Recursive so we hit child meshes inside each group
    return this.raycaster.intersectObjects(targets, true);
  }

  /**
   * Walk up the parent chain of a hit object to find the NPC id
   * stored in userData.
   */
  private findNPCData(obj: THREE.Object3D): { npcId: string; npcName: string } | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      if (current.userData.npcId) {
        return {
          npcId: current.userData.npcId as string,
          npcName: (current.userData.npcName as string) ?? '',
        };
      }
      current = current.parent;
    }
    return null;
  }

  // ----------------------------------------------------------------
  //  Click
  // ----------------------------------------------------------------

  private handleClick(e: MouseEvent): void {
    this.setMouseFromEvent(e);
    const hits = this.raycast();
    if (hits.length === 0) return;

    const data = this.findNPCData(hits[0].object);
    if (data && this.onNPCClick) {
      this.onNPCClick(data.npcId, data.npcName);
    }
  }

  // ----------------------------------------------------------------
  //  Hover highlight
  // ----------------------------------------------------------------

  private handleHover(e: MouseEvent): void {
    this.setMouseFromEvent(e);
    const hits = this.raycast();

    if (hits.length > 0) {
      const data = this.findNPCData(hits[0].object);
      if (data) {
        if (data.npcId !== this.hoveredNpcId) {
          this.clearHighlight();
          this.hoveredNpcId = data.npcId;
          const npc = this.entityManager.getNPC(data.npcId);
          npc?.setHighlight(true);
        }
        return;
      }
    }

    this.clearHighlight();
  }

  private clearHighlight(): void {
    if (this.hoveredNpcId) {
      const npc = this.entityManager.getNPC(this.hoveredNpcId);
      npc?.setHighlight(false);
      this.hoveredNpcId = null;
    }
  }
}
