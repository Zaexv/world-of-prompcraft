import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterAnimator } from './CharacterAnimator';
import { buildRaceModel } from './RaceModels';
import { getDefaultPlayerSkin, getPlayerSkinPath } from './PlayerSkins';
import { Nameplate } from '../ui/Nameplate';
import type { RemotePlayerData } from '../network/MessageProtocol';
import type { AssetLoader } from '../utils/AssetLoader';

/**
 * Represents another player in the world, rendered with race model and nameplate.
 * Interpolates toward server-provided position and yaw each frame.
 */
export class RemotePlayer {
  readonly playerId: string;
  readonly username: string;
  readonly race: string;
  readonly skin: string;
  readonly faction: string;
  readonly group: THREE.Group;
  readonly nameplate: Nameplate;

  private targetPosition: THREE.Vector3;
  private targetYaw: number;
  private visualRoot: THREE.Object3D;
  private animator: CharacterAnimator | null = null;

  constructor(data: RemotePlayerData, scene: THREE.Scene, assetLoader?: AssetLoader) {
    this.playerId = data.playerId;
    this.username = data.username;
    this.race = data.race;
    this.skin = data.skin || getDefaultPlayerSkin();
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

    if (assetLoader) {
      void this.tryLoadSkin(assetLoader);
    }
  }

  /** Set the target position and yaw for interpolation. */
  setTarget(position: [number, number, number], yaw: number): void {
    this.targetPosition.set(position[0], position[1], position[2]);
    this.targetYaw = yaw;
  }

  /** Interpolate toward target position/yaw each frame. */
  update(delta: number): void {
    const distanceToTarget = this.group.position.distanceTo(this.targetPosition);
    const lerpFactor = Math.min(1, delta * 10);
    this.group.position.lerp(this.targetPosition, lerpFactor);

    // Lerp yaw
    let yawDiff = this.targetYaw - this.group.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.group.rotation.y += yawDiff * lerpFactor;

    if (this.animator) {
      const speed = distanceToTarget / Math.max(delta, 0.001);
      this.animator.setState(speed > 8 ? 'run' : distanceToTarget > 0.05 ? 'walk' : 'idle');
      this.animator.update(delta);
    }
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

  private async tryLoadSkin(assetLoader: AssetLoader): Promise<void> {
    const modelPath = getPlayerSkinPath(this.race, this.skin);
    try {
      const gltf = await assetLoader.loadGLTF(modelPath);
      if (gltf.animations.length === 0) {
        console.warn(`[RemotePlayer] GLTF skin ${modelPath} has no animations; keeping fallback model.`);
        return;
      }
      const gltfScene = cloneSkeleton(gltf.scene) as THREE.Object3D;
      this.replaceVisualRoot(gltfScene, gltf);
    } catch (error) {
      console.warn(`[RemotePlayer] Failed to load GLTF skin ${modelPath}:`, error);
    }
  }

  private replaceVisualRoot(root: THREE.Object3D, gltf: GLTF): void {
    this.disposeVisualRoot(this.visualRoot);
    this.group.remove(this.visualRoot);

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = 2.5 / Math.max(size.x, size.y, size.z, 0.001);
    root.scale.setScalar(scale);
    root.position.y = -box.min.y * scale;

    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });

    this.group.add(root);
    this.visualRoot = root;
    this.animator = new CharacterAnimator(root, gltf.animations);

    if (!this.animator.hasAnimations()) {
      this.animator = null;
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
