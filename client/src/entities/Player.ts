import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterAnimator } from './CharacterAnimator';
import { buildRaceModel } from './RaceModels';
import { getDefaultPlayerSkin, getPlayerSkinPath } from './PlayerSkins';
import type { AssetLoader } from '../utils/AssetLoader';
import { lerpAngle } from '../utils/MathHelpers';

/**
 * Player character built from race-specific models, with optional rigged GLTF skins.
 */
export class Player {
  public readonly group: THREE.Group;

  private readonly race: string;
  private readonly skin: string;
  private visualRoot: THREE.Object3D;
  private animator: CharacterAnimator | null = null;

  private leftLeg: THREE.Mesh | null;
  private rightLeg: THREE.Mesh | null;
  private leftArm: THREE.Mesh | null;
  private rightArm: THREE.Mesh | null;
  private cloak: THREE.Mesh | null;
  private walkPhase = 0;
  private swimPhase = 0;

  /** Current body tilt for swim transition (radians, 0 = upright). */
  private bodyTilt = 0;

  /** The yaw the model is currently visually facing (radians). */
  private facingYaw = 0;

  constructor(race: string = 'night_elf', skin: string = getDefaultPlayerSkin()) {
    this.race = race;
    this.skin = skin;
    this.group = new THREE.Group();

    this.visualRoot = buildRaceModel(race);
    this.group.add(this.visualRoot);

    // Look up parts by name (may be null if model is missing a part)
    this.leftLeg = (this.group.getObjectByName('leftLeg') as THREE.Mesh) ?? null;
    this.rightLeg = (this.group.getObjectByName('rightLeg') as THREE.Mesh) ?? null;
    this.leftArm = (this.group.getObjectByName('leftArm') as THREE.Mesh) ?? null;
    this.rightArm = (this.group.getObjectByName('rightArm') as THREE.Mesh) ?? null;
    this.cloak = (this.group.getObjectByName('cloak') as THREE.Mesh) ?? null;
  }

  static async create(
    race: string = 'night_elf',
    skin: string = getDefaultPlayerSkin(),
    assetLoader?: AssetLoader,
  ): Promise<Player> {
    const player = new Player(race, skin);
    await player.tryLoadSkin(assetLoader);
    return player;
  }

  /**
   * Called every frame.
   * @param delta      Time since last frame (seconds).
   * @param isMoving   Whether the player is currently moving.
   * @param velocity   Current velocity vector (used for facing direction).
   * @param isSwimming Whether the player is currently in water.
   * @param facingYawOverride Optional facing direction override (used for RMB camera turn).
   */
  update(
    delta: number,
    isMoving: boolean,
    velocity: THREE.Vector3,
    isSwimming = false,
    facingYawOverride: number | null = null,
  ): void {
    // --- Smooth body tilt transition ---
    const targetTilt = isSwimming ? Math.PI * 0.35 : 0;
    this.bodyTilt += (targetTilt - this.bodyTilt) * clampedT(delta, 6);
    this.group.rotation.x = this.bodyTilt;

    if (this.animator) {
      const speed = velocity.length();
      const state = isSwimming
        ? (isMoving ? 'swim' : 'swim_idle')
        : (isMoving ? (speed > 10 ? 'run' : 'walk') : 'idle');
      this.animator.setState(state);
      this.animator.update(delta);
    } else if (isSwimming) {
      // ---- Swimming animation ----
      this.swimPhase += delta * (isMoving ? 6 : 2.5);
      this.walkPhase = 0;

      // Leg flutter (fast, small kicks)
      const kick = Math.sin(this.swimPhase * 2) * 0.4;
      if (this.leftLeg) this.leftLeg.rotation.x = kick;
      if (this.rightLeg) this.rightLeg.rotation.x = -kick;

      // Arm strokes (alternating breaststroke-like motion)
      const strokeL = Math.sin(this.swimPhase) * 1.1;
      const strokeR = Math.sin(this.swimPhase + Math.PI) * 1.1;
      if (this.leftArm) {
        this.leftArm.rotation.x = strokeL;
        this.leftArm.rotation.z = Math.cos(this.swimPhase) * 0.3 + 0.15;
      }
      if (this.rightArm) {
        this.rightArm.rotation.x = strokeR;
        this.rightArm.rotation.z = -(Math.cos(this.swimPhase + Math.PI) * 0.3 + 0.15);
      }

      // Cloak flows behind
      if (this.cloak) this.cloak.rotation.x = Math.sin(this.swimPhase * 0.5) * 0.2 + 0.3;
    } else {
      // ---- Land animation ----
      this.swimPhase = 0;

      // Damp arm rotation back to neutral (including Z from swimming)
      if (this.leftArm) {
        this.leftArm.rotation.x *= 0.85;
        this.leftArm.rotation.z *= 0.85;
      }
      if (this.rightArm) {
        this.rightArm.rotation.x *= 0.85;
        this.rightArm.rotation.z *= 0.85;
      }

      if (isMoving) {
        this.walkPhase += delta * 10;
        const swing = Math.sin(this.walkPhase) * 0.5;
        if (this.leftLeg) this.leftLeg.rotation.x = swing;
        if (this.rightLeg) this.rightLeg.rotation.x = -swing;

        // Arms swing opposite to legs
        if (this.leftArm) this.leftArm.rotation.x = -swing * 0.4;
        if (this.rightArm) this.rightArm.rotation.x = swing * 0.4;

        // Subtle cloak billow while moving
        if (this.cloak) this.cloak.rotation.x = Math.sin(this.walkPhase * 0.7) * 0.12;
      } else {
        // Return to neutral — dampen rotations smoothly instead of hard-resetting walkPhase
        if (this.leftLeg) this.leftLeg.rotation.x *= 0.85;
        if (this.rightLeg) this.rightLeg.rotation.x *= 0.85;
        if (this.cloak) this.cloak.rotation.x *= 0.9;
        // Let walkPhase dampen toward 0 to avoid animation jerks on stop
        this.walkPhase *= 0.85;
      }
    }

    // --- Face movement direction ---
    if (facingYawOverride !== null) {
      this.facingYaw = lerpAngle(this.facingYaw, facingYawOverride, clampedT(delta, 14));
    } else if (isMoving && (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01)) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      this.facingYaw = lerpAngle(this.facingYaw, targetYaw, clampedT(delta, 10));
    }
    this.group.rotation.y = this.facingYaw;
  }

  private async tryLoadSkin(assetLoader?: AssetLoader): Promise<void> {
    if (!assetLoader) return;

    const modelPath = getPlayerSkinPath(this.race, this.skin);
    try {
      const gltf = await assetLoader.loadGLTF(modelPath);
      if (gltf.animations.length === 0) {
        console.warn(`[Player] GLTF skin ${modelPath} has no animations; keeping fallback model.`);
        return;
      }
      const gltfScene = cloneSkeleton(gltf.scene) as THREE.Object3D;
      this.replaceVisualRoot(gltfScene, gltf);
    } catch (error) {
      console.warn(`[Player] Failed to load GLTF skin ${modelPath}:`, error);
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
      console.warn('[Player] Loaded GLTF skin without usable clips; keeping procedural animation.');
      this.animator = null;
      this.group.remove(root);
      this.disposeVisualRoot(root);
      this.visualRoot = buildRaceModel(this.race);
      this.group.add(this.visualRoot);
      this.leftLeg = (this.group.getObjectByName('leftLeg') as THREE.Mesh) ?? null;
      this.rightLeg = (this.group.getObjectByName('rightLeg') as THREE.Mesh) ?? null;
      this.leftArm = (this.group.getObjectByName('leftArm') as THREE.Mesh) ?? null;
      this.rightArm = (this.group.getObjectByName('rightArm') as THREE.Mesh) ?? null;
      this.cloak = (this.group.getObjectByName('cloak') as THREE.Mesh) ?? null;
    } else {
      this.leftLeg = null;
      this.rightLeg = null;
      this.leftArm = null;
      this.rightArm = null;
      this.cloak = null;
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

/** Helper: clamp a lerp factor so it doesn't overshoot at low framerates. */
function clampedT(delta: number, speed: number): number {
  return Math.min(1, delta * speed);
}
