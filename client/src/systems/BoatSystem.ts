import * as THREE from 'three';
import type { PlayerController } from '../entities/PlayerController';
import { Water } from '../scene/Water';
import { buildMesh } from '../meshes';
import { AudioSystem } from '../audio/AudioSystem';

/**
 * BoatSystem — when the player enters water they board a boat instead of
 * swimming; when they reach land they hop back out. Self-contained and modular:
 * it watches `PlayerController.isSwimming`, drives `controller.inBoat` (which
 * switches the controller to surface-sailing physics), and owns the boat mesh +
 * its bob/rock and the board/leave hop animation.
 *
 * Call `update(controller, playerGroup, delta)` once per frame, after the
 * controller has moved and the player group position has been synced.
 */
const BOARD_TIME = 0.55; // seconds for the hop-in / hop-out animation
const HOP_HEIGHT = 0.7;  // peak of the boarding hop arc (world units)
const BOB_AMP = 0.12;    // vertical bob amplitude
const ROCK_AMP = 0.05;   // side-to-side rock (radians)

export class BoatSystem {
  private readonly boat: THREE.Group;
  private mounted = false;
  /** >0 while boarding, <0 while leaving; magnitude counts down to 0. */
  private transition = 0;
  private leaving = false;
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {
    const built = buildMesh('boat_rowboat', { position: new THREE.Vector3(), scale: 1 });
    this.boat = (built as THREE.Group) ?? new THREE.Group();
    this.boat.visible = false;
    this.scene.add(this.boat);
  }

  /** True while the player is riding the boat (or mid board/leave animation). */
  get isActive(): boolean {
    return this.mounted || this.transition !== 0;
  }

  update(controller: PlayerController, playerGroup: THREE.Group, delta: number): void {
    this.time += delta;
    const wantsBoat = controller.isSwimming;

    if (wantsBoat && !this.mounted) this.board(controller);
    else if (!wantsBoat && this.mounted) this.leave(controller);

    if (!this.isActive) return;

    const waterLevel = Water.getWaterLevel();
    const px = playerGroup.position.x;
    const pz = playerGroup.position.z;

    // Gentle bob + rock, phase-offset so the rock doesn't peak with the bob.
    const bob = Math.sin(this.time * 1.6) * BOB_AMP;
    const rockZ = Math.sin(this.time * 1.1) * ROCK_AMP;
    const rockX = Math.cos(this.time * 0.9) * ROCK_AMP * 0.6;

    // Boarding / leaving hop arc (0→1→0 over the transition window).
    let hop = 0;
    if (this.transition > 0) {
      this.transition = Math.max(0, this.transition - delta);
      const p = 1 - this.transition / BOARD_TIME; // 0..1
      hop = Math.sin(p * Math.PI) * HOP_HEIGHT;
      if (this.leaving && this.transition === 0) {
        this.boat.visible = false;
        this.leaving = false;
      }
    }

    // Boat sits on the water surface under the player, aligned to their facing.
    this.boat.position.set(px, waterLevel + bob, pz);
    this.boat.rotation.set(rockX, playerGroup.rotation.y, rockZ);
    const scale = this.mounted ? 1 : Math.max(0.001, 1 - this.transition / BOARD_TIME);
    this.boat.scale.setScalar(scale);

    // Seat the player on the deck and let them bob with the boat (+ the hop).
    if (this.mounted || this.leaving) {
      playerGroup.position.y = controller.position.y + bob + hop;
    }
  }

  private board(controller: PlayerController): void {
    this.mounted = true;
    this.leaving = false;
    this.transition = BOARD_TIME;
    controller.inBoat = true;
    this.boat.visible = true;
    this.boat.scale.setScalar(0.001);
    AudioSystem.getInstance().playSfx('jump');
  }

  private leave(controller: PlayerController): void {
    this.mounted = false;
    this.leaving = true;
    this.transition = BOARD_TIME;
    controller.inBoat = false;
    AudioSystem.getInstance().playSfx('jump');
  }
}
