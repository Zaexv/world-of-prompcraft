import * as THREE from 'three';
import { buildRaceModel } from './RaceModels';
import { Nameplate } from '../ui/Nameplate';
import type { RemotePlayerData } from '../network/MessageProtocol';

/**
 * Represents another player in the world, rendered with race model and nameplate.
 * Interpolates toward server-provided position and yaw each frame.
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

  constructor(data: RemotePlayerData, scene: THREE.Scene) {
    this.playerId = data.playerId;
    this.username = data.username;
    this.race = data.race;
    this.faction = data.faction;

    // Build the visual model for the race
    this.group = buildRaceModel(data.race);
    this.group.position.set(data.position[0], data.position[1], data.position[2]);
    this.group.rotation.y = data.yaw;

    // Nameplate colored by faction
    this.nameplate = new Nameplate(data.username, data.maxHp);
    // Override nameplate color via the sprite's material color
    const nameplateColor = data.faction === 'horde' ? 0xff4444 : 0x4488ff;
    (this.nameplate.sprite.material as THREE.SpriteMaterial).color.setHex(nameplateColor);
    this.group.add(this.nameplate.sprite);

    this.targetPosition = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
    this.targetYaw = data.yaw;

    scene.add(this.group);
  }

  /** Set the target position and yaw for interpolation. */
  setTarget(position: [number, number, number], yaw: number): void {
    this.targetPosition.set(position[0], position[1], position[2]);
    this.targetYaw = yaw;
  }

  /** Interpolate toward target position/yaw each frame. */
  update(delta: number): void {
    const lerpFactor = Math.min(1, delta * 10);
    this.group.position.lerp(this.targetPosition, lerpFactor);

    // Lerp yaw
    let yawDiff = this.targetYaw - this.group.rotation.y;
    // Normalize to [-PI, PI]
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.group.rotation.y += yawDiff * lerpFactor;
  }

  /** Remove this remote player from the scene and clean up. */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
  }
}
