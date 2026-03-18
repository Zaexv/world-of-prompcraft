import * as THREE from 'three';
import { EntityManager } from '../entities/EntityManager';

/**
 * Handles raycaster-based NPC interaction (click) and hover highlighting.
 *
 * - Left-click works when pointer lock is OFF (cursor visible).
 * - Right-click always works for NPC interaction regardless of pointer lock state.
 * - Hover highlight is only active when pointer lock is OFF.
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

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    entityManager: EntityManager,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.entityManager = entityManager;

    // Left-click (only when cursor is free / no pointer lock)
    this.domElement.addEventListener('click', (e: MouseEvent) => {
      if (document.pointerLockElement) return; // pointer locked — ignore left click
      this.handleClick(e);
    });

    // Right-click (always works)
    this.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      this.handleClick(e);
    });

    // Hover (only when cursor is free)
    this.domElement.addEventListener('mousemove', (e: MouseEvent) => {
      if (document.pointerLockElement) {
        this.clearHighlight();
        return;
      }
      this.handleHover(e);
    });
  }

  // ----------------------------------------------------------------

  private setMouseFromEvent(e: MouseEvent): void {
    const rect = this.domElement.getBoundingClientRect();
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
