/**
 * BaseEntity — Abstract base class for all game entities (Player, NPC, RemotePlayer).
 *
 * Provides common lifecycle, positioning, and state management.
 */

import * as THREE from 'three';

export abstract class BaseEntity {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  mesh: THREE.Object3D;

  protected isVisible: boolean = true;
  protected isDestroyed: boolean = false;

  constructor(id: string, mesh: THREE.Object3D) {
    this.id = id;
    this.mesh = mesh;
    this.position = mesh.position;
    this.rotation = mesh.rotation;
  }

  /**
   * Update entity state (called each frame).
   */
  abstract update(deltaTime: number): void;

  /**
   * Show entity.
   */
  show(): void {
    if (!this.isVisible) {
      this.mesh.visible = true;
      this.isVisible = true;
    }
  }

  /**
   * Hide entity.
   */
  hide(): void {
    if (this.isVisible) {
      this.mesh.visible = false;
      this.isVisible = false;
    }
  }

  /**
   * Get current position.
   */
  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  /**
   * Set position.
   */
  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
  }

  /**
   * Teleport entity (instant move).
   */
  teleport(x: number, y: number, z: number): void {
    this.setPosition(x, y, z);
  }

  /**
   * Get distance to another entity.
   */
  distanceTo(other: BaseEntity): number {
    return this.position.distanceTo(other.position);
  }

  /**
   * Destroy entity and clean up resources.
   */
  abstract destroy(): void;

  /**
   * Check if entity is destroyed.
   */
  isDead(): boolean {
    return this.isDestroyed;
  }
}
