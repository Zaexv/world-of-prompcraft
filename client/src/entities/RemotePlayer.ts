import * as THREE from 'three';
import { buildRaceModel } from './RaceModels';
import { Nameplate } from '../ui/Nameplate';
import type { RemotePlayerData } from '../network/MessageProtocol';

/**
 * Represents another player in the world, rendered with a procedural race model
 * and nameplate. Interpolates toward server-provided position and yaw each frame.
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

    // Nameplate colored by faction
    this.nameplate = new Nameplate(data.username, data.maxHp);
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
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.group.rotation.y += yawDiff * lerpFactor;
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
