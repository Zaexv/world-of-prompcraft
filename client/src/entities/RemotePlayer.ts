import * as THREE from 'three';
import { buildRaceModel } from './RaceModels';
import { Nameplate } from '../ui/Nameplate';
import { PlayerAnimator, extractPlayerRig, type PlayerRig } from '../animations';
import type { RemotePlayerData } from '../network/MessageProtocol';

/**
 * Represents another player in the world, rendered with a procedural race model
 * and nameplate. Interpolates toward server-provided position and yaw each frame,
 * and runs the same procedural animator as the local player — locomotion is
 * derived from the interpolated velocity, so remote avatars walk, lean and
 * idle exactly like the local one instead of gliding statically.
 */
export class RemotePlayer {
  readonly playerId: string;
  readonly username: string;
  readonly race: string;
  readonly faction: string;
  readonly group: THREE.Group;
  readonly nameplate: Nameplate;

  private targetPosition: THREE.Vector3;
  private targetYaw: number;
  private visualRoot: THREE.Object3D;
  private rig: PlayerRig;
  private animator = new PlayerAnimator();

  // Reused per frame to derive velocity without allocations.
  private readonly prevPosition = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  constructor(data: RemotePlayerData, scene: THREE.Scene) {
    this.playerId = data.playerId;
    this.username = data.username;
    this.race = data.race;
    this.faction = data.faction;

    this.group = new THREE.Group();
    this.visualRoot = buildRaceModel(data.race);
    this.group.add(this.visualRoot);
    this.group.position.set(data.position[0], data.position[1], data.position[2]);
    this.group.rotation.y = data.yaw;
    this.rig = extractPlayerRig(this.group, this.visualRoot);

    // Nameplate colored by faction
    this.nameplate = new Nameplate(data.username, data.maxHp);
    const nameplateColor = data.faction === 'horde' ? 0xff4444 : 0x4488ff;
    (this.nameplate.sprite.material as THREE.SpriteMaterial).color.setHex(nameplateColor);
    this.group.add(this.nameplate.sprite);

    this.targetPosition = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
    this.targetYaw = data.yaw;
    this.prevPosition.copy(this.group.position);

    scene.add(this.group);
  }

  /** Set the target position and yaw for interpolation. */
  setTarget(position: [number, number, number], yaw: number): void {
    this.targetPosition.set(position[0], position[1], position[2]);
    this.targetYaw = yaw;
  }

  /** Update the nameplate health bar from server-authoritative HP. */
  setHP(hp: number, maxHp: number): void {
    this.nameplate.updateHP(hp, maxHp);
  }

  /** Interpolate toward target position/yaw each frame; animate from velocity. */
  update(delta: number): void {
    const lerpFactor = Math.min(1, delta * 10);
    this.prevPosition.copy(this.group.position);
    this.group.position.lerp(this.targetPosition, lerpFactor);

    // Velocity of the interpolated motion drives the walk cycle — the same
    // signal the local player feeds its animator, just derived from the lerp.
    if (delta > 0) {
      this.velocity.copy(this.group.position).sub(this.prevPosition).divideScalar(delta);
    }
    const isMoving = this.velocity.lengthSq() > 0.25; // ~0.5 m/s — below is settle jitter

    // The animator owns rotation: the server yaw arrives as a facing override
    // and is eased exactly like the local avatar's camera-strafe facing.
    this.animator.update(this.rig, {
      delta,
      isMoving,
      velocity: this.velocity,
      isSwimming: false,
      facingYawOverride: this.targetYaw,
      isGrounded: true,
      inBoat: false,
      boardJump: 0,
    });
  }

  /** Remove this remote player from the scene and clean up. */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.disposeVisualRoot(this.visualRoot);
    this.nameplate.sprite.material.dispose();
    if (
      this.nameplate.sprite.material instanceof THREE.SpriteMaterial &&
      this.nameplate.sprite.material.map
    ) {
      this.nameplate.sprite.material.map.dispose();
    }
  }

  private disposeVisualRoot(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          for (const material of child.material) {
            material.dispose();
          }
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
