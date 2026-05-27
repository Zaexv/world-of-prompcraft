import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterAnimator } from './CharacterAnimator';
import { buildRaceModel } from './RaceModels';
import { getDefaultPlayerSkin, getPlayerSkinPath } from './PlayerSkins';
import type { AssetLoader } from '../utils/asset/AssetLoader';
import { lerpAngle } from '../utils/math/MathHelpers';

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
  private head: THREE.Mesh | null;

  // --- Animation phases ---
  private walkPhase = 0;
  private breathPhase = Math.random() * Math.PI * 2;
  private idlePhase = Math.random() * Math.PI * 2;

  // --- Smooth animation state ---
  private forwardLean = 0;
  private bankLean = 0;
  private armRaise = 0;
  private squashTimer = 0;
  private wasGrounded = true;

  /** The yaw the model is currently visually facing (radians). */
  private facingYaw = 0;
  private prevFacingYaw = 0;
  private turnRate = 0;

  constructor(race: string = 'night_elf', skin: string = getDefaultPlayerSkin()) {
    this.race = race;
    this.skin = skin;
    this.group = new THREE.Group();

    this.visualRoot = buildRaceModel(race);
    this.group.add(this.visualRoot);

    this.leftLeg = (this.group.getObjectByName('leftLeg') as THREE.Mesh) ?? null;
    this.rightLeg = (this.group.getObjectByName('rightLeg') as THREE.Mesh) ?? null;
    this.leftArm = (this.group.getObjectByName('leftArm') as THREE.Mesh) ?? null;
    this.rightArm = (this.group.getObjectByName('rightArm') as THREE.Mesh) ?? null;
    this.cloak = (this.group.getObjectByName('cloak') as THREE.Mesh) ?? null;
    this.head = (this.group.getObjectByName('head') as THREE.Mesh) ?? null;
  }

  /**
   * Create a player with a procedural base model and optionally upgrade to a GLTF skin in the background.
   * Never blocks game startup.
   */
  static create(
    race: string = 'night_elf',
    skin: string = getDefaultPlayerSkin(),
    assetLoader?: AssetLoader,
  ): Player {
    const player = new Player(race, skin);
    void player.tryLoadSkin(assetLoader);
    return player;
  }

  update(
    delta: number,
    isMoving: boolean,
    velocity: THREE.Vector3,
    isSwimming = false,
    facingYawOverride: number | null = null,
    isGrounded = true,
  ): void {
    // --- Phases ---
    const speed = velocity.length();
    const isRunning = isMoving && speed > 10;
    const animSpeed = isRunning ? 15 : 8;
    if (isMoving) this.walkPhase += delta * animSpeed;
    else this.walkPhase *= 0.85;

    this.breathPhase += delta * 1.35;
    this.idlePhase += delta * 0.4;

    // --- Landing squash ---
    if (isGrounded && !this.wasGrounded) {
      this.squashTimer = 0.18;
    }
    this.wasGrounded = isGrounded;
    if (this.squashTimer > 0) {
      this.squashTimer -= delta;
      const t = Math.max(0, this.squashTimer / 0.18);
      const squash = 1 - 0.14 * Math.sin(t * Math.PI);
      this.visualRoot.scale.set(1 + (1 - squash) * 0.3, squash, 1 + (1 - squash) * 0.3);
    } else {
      this.visualRoot.scale.set(1, 1, 1);
    }

    // --- Turn rate for banking ---
    const facingDelta = angleDiff(this.facingYaw, this.prevFacingYaw);
    this.turnRate = lerp(this.turnRate, facingDelta / Math.max(delta, 0.001), clampedT(delta, 8));
    this.prevFacingYaw = this.facingYaw;

    if (this.animator) {
      const state = isMoving ? (isRunning ? 'run' : 'walk') : 'idle';
      this.animator.setState(state);
      this.animator.update(delta);
    } else {
      this.updateProceduralAnimation(delta, isMoving, isRunning);
    }

    // --- Forward lean ---
    const targetLean = isRunning ? -0.13 : isMoving ? -0.07 : 0;
    this.forwardLean = lerp(this.forwardLean, targetLean, clampedT(delta, 5));

    // --- Turn banking (lean into turns) ---
    const targetBank = clamp(this.turnRate * 0.015, -0.12, 0.12) * (isMoving ? 1 : 0);
    this.bankLean = lerp(this.bankLean, targetBank, clampedT(delta, 6));

    this.visualRoot.rotation.x = this.forwardLean;
    this.visualRoot.rotation.z = this.bankLean;

    // --- Swimming override ---
    if (isSwimming) {
      this.visualRoot.position.y = 0.34;
      this.visualRoot.rotation.z = this.bankLean * 0.5;
    } else if (!this.animator) {
      const breath = Math.sin(this.breathPhase) * 0.012;
      const idleSway = Math.sin(this.idlePhase) * (isMoving ? 0 : 0.018);
      const moveBob = Math.sin(this.walkPhase) * (isMoving ? 0.04 : 0);
      this.visualRoot.position.y = breath + moveBob + idleSway;
    } else {
      this.visualRoot.position.y = 0;
    }

    // --- Face movement direction ---
    if (facingYawOverride !== null) {
      this.facingYaw = lerpAngle(this.facingYaw, facingYawOverride, clampedT(delta, 14));
    } else if (isMoving && (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01)) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      this.facingYaw = lerpAngle(this.facingYaw, targetYaw, clampedT(delta, 10));
    }
    this.group.rotation.y = this.facingYaw;
    this.group.rotation.x = 0;
  }

  private updateProceduralAnimation(delta: number, isMoving: boolean, isRunning: boolean): void {
    const swing = Math.sin(this.walkPhase) * (isRunning ? 0.65 : 0.48);
    const breathNod = Math.sin(this.breathPhase) * 0.012;
    const idleFidget = Math.sin(this.idlePhase * 2.3) * (isMoving ? 0 : 0.008);

    // Legs: stride
    if (this.leftLeg) this.leftLeg.rotation.x = swing;
    if (this.rightLeg) this.rightLeg.rotation.x = -swing;

    // Arms: swing opposite legs, raise slightly when running (combat-ready)
    const targetArmRaise = isRunning ? -0.35 : 0;
    this.armRaise = lerp(this.armRaise, targetArmRaise, clampedT(delta, 4));

    if (this.leftArm) {
      this.leftArm.rotation.x = -swing * 0.55 + this.armRaise;
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, isMoving ? -0.08 : -0.04, clampedT(delta, 3));
    }
    if (this.rightArm) {
      this.rightArm.rotation.x = swing * 0.55 + this.armRaise;
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, isMoving ? 0.08 : 0.04, clampedT(delta, 3));
    }

    // Head: breath nod + idle look
    if (this.head) {
      this.head.rotation.x = breathNod + idleFidget;
      this.head.rotation.y = lerp(this.head.rotation.y, isMoving ? 0 : Math.sin(this.idlePhase * 0.7) * 0.08, clampedT(delta, 2));
    }

    // Cloak: multi-frequency billow, stronger while running
    if (this.cloak) {
      const cloakSpeed = isRunning ? 1.6 : 1.0;
      const cloakAmp = isRunning ? 0.22 : 0.1;
      this.cloak.rotation.x = lerp(
        this.cloak.rotation.x,
        Math.sin(this.walkPhase * cloakSpeed) * cloakAmp
          + Math.sin(this.walkPhase * 0.3) * cloakAmp * 0.4,
        clampedT(delta, 5),
      );
    }
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
      this.head = (this.group.getObjectByName('head') as THREE.Mesh) ?? null;
    } else {
      this.leftLeg = null;
      this.rightLeg = null;
      this.leftArm = null;
      this.rightArm = null;
      this.cloak = null;
      this.head = null;
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

function clampedT(delta: number, speed: number): number {
  return Math.min(1, delta * speed);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Shortest signed difference between two angles. */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
