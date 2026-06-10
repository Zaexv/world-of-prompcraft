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
const BOAT_SCALE = 2.2;   // boat is much bigger than the character
const BOAT_OFFSET = 2.6;  // shift the hull forward so the player sits aft at the helm
const BOARD_TIME = 0.6;   // seconds for the jump-in / jump-out animation
const HOP_HEIGHT = 1.4;   // peak of the boarding leap arc (world units)
const LUNGE = 1.8;        // how far back the leap starts (eases forward into the seat)
const BOB_AMP = 0.14;     // vertical bob amplitude
const ROCK_AMP = 0.05;    // side-to-side rock (radians)

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

    // Jump arc (0→1→0) over the transition; while boarding the player also lunges
    // forward from behind the seat so it reads as a leap INTO the boat.
    let hop = 0, jump = 0, lunge = 0;
    if (this.transition > 0) {
      this.transition = Math.max(0, this.transition - delta);
      const p = 1 - this.transition / BOARD_TIME; // 0..1
      jump = Math.sin(p * Math.PI);
      hop = jump * HOP_HEIGHT;
      if (!this.leaving) lunge = (1 - p) * LUNGE; // boarding only: ease into the seat
      if (this.leaving && this.transition === 0) {
        this.boat.visible = false;
        this.leaving = false;
      }
    }
    controller.boardJumpT = jump;

    // Forward for this game's yaw convention is (sin, cos). The boat is shifted
    // FORWARD of the player so the player sits aft at the helm.
    const yaw = playerGroup.rotation.y;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    this.boat.position.set(px + fwdX * BOAT_OFFSET, waterLevel + bob, pz + fwdZ * BOAT_OFFSET);
    this.boat.rotation.set(rockX, yaw, rockZ);
    const grow = this.mounted ? 1 : Math.max(0.001, 1 - this.transition / BOARD_TIME);
    this.boat.scale.setScalar(grow * BOAT_SCALE);

    // Seat the player at the helm, bobbing with the boat, plus the leap arc/lunge.
    if (this.mounted || this.leaving) {
      playerGroup.position.y = controller.position.y + bob + hop;
      playerGroup.position.x = px - fwdX * lunge;
      playerGroup.position.z = pz - fwdZ * lunge;
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
