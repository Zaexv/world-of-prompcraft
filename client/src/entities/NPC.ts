import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NPCAnimator } from './NPCAnimator';
import { createNPCMotionProfile, type NPCMotionProfile, type NPCMotionSource } from './NPCMotion';
import { Nameplate } from '../ui/Nameplate';
import { ActionIcon } from '../ui/ActionIcon';
import { NPC_MODEL_MAP } from './NPCModels';
import type { AssetLoader } from '../utils/AssetLoader';

export interface NPCConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
  color?: number;
  behavior?: NPCMotionSource['behavior'];
  movementStyle?: NPCMotionSource['movementStyle'];
  wanderRadius?: number;
}

/**
 * An NPC entity with a detailed model, role-based accessories,
 * hover highlight support, and a procedural animator.
 */
export class NPC {
  public readonly id: string;
  public readonly name: string;
  public readonly position: THREE.Vector3;
  public readonly mesh: THREE.Group;
  public readonly animator: NPCAnimator;
  public readonly nameplate: Nameplate;
  public readonly actionIcon: ActionIcon;

  /** Home position — the NPC wanders around this point. */
  public homePosition: THREE.Vector3;
  /** How far from home the NPC will wander. */
  public wanderRadius = 8;

  private readonly motionProfile: NPCMotionProfile;
  private wanderTarget: THREE.Vector3 = new THREE.Vector3();
  private hasWanderTarget = false;
  private wanderCooldown: number;
  private isWandering = false;
  private patrolTargets: THREE.Vector3[] = [];
  private patrolIndex = 0;
  private readonly patrolSeed: number;

  /** Stores original emissive colours so highlights can be toggled. */
  private materials: THREE.MeshStandardMaterial[] = [];
  /** Original emissive hex values, captured on first highlight. */
  private originalEmissives: number[] = [];
  /** True when the mesh has been replaced with a GLTF scene. */
  private gltfMode = false;

  constructor(config: NPCConfig) {
    this.id = config.id;
    this.name = config.name;
    this.position = config.position.clone();
    this.homePosition = config.position.clone();
    this.motionProfile = createNPCMotionProfile(config);
    this.wanderRadius = config.wanderRadius ?? this.motionProfile.wanderRadius;
    this.wanderCooldown = this.motionProfile.pauseMin + Math.random() * (this.motionProfile.pauseMax - this.motionProfile.pauseMin);
    this.patrolSeed = hashString(this.id);
    this.mesh = new THREE.Group();

    const color = config.color ?? 0xcc6633;

    // ----- Body (taller cylinder to match improved player) -----
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.4, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.5;
    body.castShadow = true;
    this.mesh.add(body);
    this.materials.push(bodyMat);

    // ----- Shoulders (small spheres on each side) -----
    const shoulderGeo = new THREE.SphereGeometry(0.14, 8, 6);
    const shoulderMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.15) });
    const leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    leftShoulder.position.set(-0.34, 2.05, 0);
    this.mesh.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    rightShoulder.position.set(0.34, 2.05, 0);
    this.mesh.add(rightShoulder);
    this.materials.push(shoulderMat);

    // ----- Belt (thin torus around waist) -----
    const beltGeo = new THREE.TorusGeometry(0.33, 0.04, 6, 16);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x8b6914 });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 1.1;
    belt.rotation.x = Math.PI / 2;
    this.mesh.add(belt);
    this.materials.push(beltMat);

    // ----- Head -----
    const headGeo = new THREE.SphereGeometry(0.25, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf5cba7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.42;
    head.castShadow = true;
    this.mesh.add(head);
    this.materials.push(headMat);

    // ----- Legs (slightly longer) -----
    const legGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.13, 0.42, 0);
    leftLeg.name = 'leftLeg';
    this.mesh.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.13, 0.42, 0);
    rightLeg.name = 'rightLeg';
    this.mesh.add(rightLeg);

    this.materials.push(legMat);

    // ----- Hat / cone -----
    const hatGeo = new THREE.ConeGeometry(0.18, 0.35, 8);
    const hatMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.4) });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 2.78;
    this.mesh.add(hat);
    this.materials.push(hatMat);

    // ----- Role-based accessories -----
    this.addRoleAccessory(color);

    // ----- Floating nameplate -----
    this.nameplate = new Nameplate(this.name);
    this.mesh.add(this.nameplate.sprite);

    // ----- Action status icon (above nameplate) -----
    this.actionIcon = new ActionIcon();
    this.mesh.add(this.actionIcon.sprite);

    // Tag every child mesh so the raycaster can identify this NPC
    this.mesh.traverse((child) => {
      child.userData.npcId = this.id;
      child.userData.npcName = this.name;
    });

    // Position the group
    this.mesh.position.copy(this.position);

    // Animator
    this.animator = new NPCAnimator(this.mesh, this.motionProfile);
  }

  /**
   * Create an NPC, optionally upgrading to a GLTF model if one is available.
   * Falls back to the procedural mesh silently on any load error.
   */
  static async create(config: NPCConfig, assetLoader?: AssetLoader): Promise<NPC> {
    const npc = new NPC(config);
    if (assetLoader) {
      const modelPath = NPC_MODEL_MAP[config.id];
      if (modelPath) {
        try {
          const gltf = await assetLoader.loadGLTF(modelPath);
          npc.replaceWithGLTF(gltf);
        } catch {
          // GLTF unavailable — keep procedural mesh
        }
      }
    }
    return npc;
  }

  /** Swap out procedural geometry for a loaded GLTF scene. */
  private replaceWithGLTF(gltf: GLTF): void {
    // Remove procedural meshes but keep sprites (nameplate, actionIcon)
    const toRemove = this.mesh.children.filter((child) => !(child instanceof THREE.Sprite));
    for (const child of toRemove) this.mesh.remove(child);

    // Scale the GLTF so it roughly matches the procedural NPC height (~2.5 units)
    const gltfScene = gltf.scene.clone();
    const box = new THREE.Box3().setFromObject(gltfScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = 2.5 / Math.max(size.x, size.y, size.z, 0.001);
    gltfScene.scale.setScalar(scale);
    // Sit on the ground
    gltfScene.position.y = -box.min.y * scale;

    gltfScene.traverse((child) => {
      child.userData.npcId = this.id;
      child.userData.npcName = this.name;
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });

    this.mesh.add(gltfScene);
    this.materials = [];
    this.originalEmissives = [];
    this.gltfMode = true;

    if (gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltfScene);
      this.animator.setMixer(mixer, gltf.animations);
    }
  }

  /** Collect all MeshStandardMaterial instances from the current mesh tree. */
  private collectStdMaterials(): THREE.MeshStandardMaterial[] {
    const result: THREE.MeshStandardMaterial[] = [];
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) result.push(mat);
        }
      }
    });
    return result;
  }

  /** Call every frame. */
  update(delta: number): void {
    this.animator.update(delta);
    this.actionIcon.update(delta);
    // Always keep the logical position in sync with the mesh
    this.position.copy(this.mesh.position);
  }

  /** Trigger an emote/animation on this NPC. */
  playEmote(emote: string): void {
    const mapped = emote === 'attack' ? 'attack' : 'emote';
    this.animator.play(mapped);
    this.actionIcon.show(emote, 2.5);
  }

  /** Show an action icon above this NPC (e.g. when performing a tool action). */
  showAction(actionKind: string, duration = 3.0): void {
    this.actionIcon.show(actionKind, duration);
  }

  /** Dispose all GPU resources (geometries, materials, textures). */
  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          for (const mat of child.material) {
            mat.dispose();
          }
        } else {
          child.material.dispose();
        }
      }
    });

    // Dispose nameplate texture and sprite material
    this.nameplate.sprite.material.dispose();
    if (this.nameplate.sprite.material instanceof THREE.SpriteMaterial && this.nameplate.sprite.material.map) {
      this.nameplate.sprite.material.map.dispose();
    }

    // Dispose actionIcon texture and sprite material
    this.actionIcon.sprite.material.dispose();
    if (this.actionIcon.sprite.material instanceof THREE.SpriteMaterial && this.actionIcon.sprite.material.map) {
      this.actionIcon.sprite.material.map.dispose();
    }
  }

  /** Toggle hover/highlight by adding emissive colour. */
  setHighlight(on: boolean): void {
    const mats = this.gltfMode ? this.collectStdMaterials() : this.materials;
    if (on) {
      if (this.originalEmissives.length === 0) {
        this.originalEmissives = mats.map((mat) => mat.emissive.getHex());
      }
      for (const mat of mats) {
        mat.emissive.setHex(mat.emissive.getHex() | 0x444444);
      }
    } else {
      for (let i = 0; i < mats.length; i++) {
        mats[i].emissive.setHex(this.originalEmissives[i] ?? 0x000000);
      }
    }
  }

  /**
   * Update wandering AI — call every frame with delta and a terrain height callback.
   * Optionally accepts a collision system to prevent walking through buildings/trees.
   */
  updateWander(
    delta: number,
    getHeightAt: (x: number, z: number) => number,
    collisionSystem?: { isPositionBlocked: (x: number, y: number, z: number, halfExtent?: number) => boolean },
  ): void {
    if (this.wanderRadius <= 0) return;

    const pathBlocked = (fromX: number, fromZ: number, toX: number, toZ: number, halfExtent: number): boolean => {
      if (!collisionSystem) return false;
      const dx = toX - fromX;
      const dz = toZ - fromZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const steps = Math.max(1, Math.ceil(distance / 0.08));

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const sx = fromX + dx * t;
        const sz = fromZ + dz * t;
        const sy = getHeightAt(sx, sz);
        if (collisionSystem.isPositionBlocked(sx, sy, sz, halfExtent)) return true;
      }
      return false;
    };

    // Decrement cooldown
    if (!this.isWandering) {
      this.wanderCooldown -= delta;
      if (this.wanderCooldown <= 0) {
        const nextTarget = this.pickWanderTarget(getHeightAt, collisionSystem);
        if (!nextTarget) {
          this.wanderCooldown = this.nextCooldown();
          return;
        }

        this.wanderTarget.copy(nextTarget);
        this.hasWanderTarget = true;
        this.isWandering = true;
        this.animator.play('walk');
      }
      return;
    }

    // Move toward wander target
    if (this.hasWanderTarget) {
      const dx = this.wanderTarget.x - this.mesh.position.x;
      const dz = this.wanderTarget.z - this.mesh.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < 0.25) {
        // Reached target
        this.isWandering = false;
        this.hasWanderTarget = false;
        this.wanderCooldown = this.nextCooldown();
        this.animator.play('idle');
        return;
      }

      const dist = Math.sqrt(distSq);
      const speed = this.motionProfile.moveSpeed;
      const step = Math.min(speed * delta, dist);
      const nx = dx / dist;
      const nz = dz / dist;

      let nextX = this.mesh.position.x + nx * step;
      let nextZ = this.mesh.position.z + nz * step;
      let nextY = getHeightAt(nextX, nextZ);

      // If blocked, try short detours (10 steering probes) before giving up.
      if (pathBlocked(this.mesh.position.x, this.mesh.position.z, nextX, nextZ, 0.55)) {
        const heading = Math.atan2(nz, nx);
        let foundDetour = false;

        for (let probe = 1; probe <= 10; probe++) {
          const side = probe % 2 === 0 ? -1 : 1;
          const stepBand = Math.ceil(probe / 2);
          const detourAngle = heading + side * stepBand * 0.18;
          const probeX = this.mesh.position.x + Math.cos(detourAngle) * step;
          const probeZ = this.mesh.position.z + Math.sin(detourAngle) * step;
          const probeY = getHeightAt(probeX, probeZ);

          if (!pathBlocked(this.mesh.position.x, this.mesh.position.z, probeX, probeZ, 0.55)) {
            nextX = probeX;
            nextZ = probeZ;
            nextY = probeY;
            foundDetour = true;
            break;
          }
        }

        if (!foundDetour) {
          this.isWandering = false;
          this.hasWanderTarget = false;
          this.wanderCooldown = this.nextCooldown();
          this.animator.play('idle');
          return;
        }
      }

      this.mesh.position.x = nextX;
      this.mesh.position.z = nextZ;
      this.mesh.position.y = nextY;

      // Update logical position to match mesh
      this.position.copy(this.mesh.position);

      // Face walking direction (smooth rotation)
      const targetAngle = Math.atan2(nx, nz);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, targetAngle, Math.min(1, this.motionProfile.turnSpeed * delta));

      // Update animator baseY so idle bob works at new height
      this.animator.setBaseY(this.mesh.position.y);
    }
  }

  private nextCooldown(): number {
    return this.motionProfile.pauseMin + Math.random() * (this.motionProfile.pauseMax - this.motionProfile.pauseMin);
  }

  private pickWanderTarget(
    getHeightAt: (x: number, z: number) => number,
    collisionSystem?: { isPositionBlocked: (x: number, y: number, z: number, halfExtent?: number) => boolean },
  ): THREE.Vector3 | null {
    if (this.motionProfile.style === 'patrol') {
      return this.pickPatrolTarget(getHeightAt, collisionSystem);
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * this.wanderRadius;
      const tx = this.homePosition.x + Math.cos(angle) * dist;
      const tz = this.homePosition.z + Math.sin(angle) * dist;
      const ty = getHeightAt(tx, tz);

      if (
        collisionSystem?.isPositionBlocked(tx, ty, tz, 0.55)
      ) {
        continue;
      }

      return new THREE.Vector3(tx, ty, tz);
    }

    return null;
  }

  private pickPatrolTarget(
    getHeightAt: (x: number, z: number) => number,
    collisionSystem?: { isPositionBlocked: (x: number, y: number, z: number, halfExtent?: number) => boolean },
  ): THREE.Vector3 | null {
    if (this.patrolTargets.length === 0) {
      const points = Math.max(2, this.motionProfile.patrolPoints);
      const rng = seededRandom(this.patrolSeed);
      const baseAngle = rng() * Math.PI * 2;
      for (let i = 0; i < points; i++) {
        const angle = baseAngle + (i / points) * Math.PI * 2;
        const radius = this.wanderRadius * (0.55 + rng() * 0.35);
        const tx = this.homePosition.x + Math.cos(angle) * radius;
        const tz = this.homePosition.z + Math.sin(angle) * radius;
        const ty = getHeightAt(tx, tz);
        if (collisionSystem?.isPositionBlocked(tx, ty, tz, 0.55)) continue;
        this.patrolTargets.push(new THREE.Vector3(tx, ty, tz));
      }
    }

    if (this.patrolTargets.length === 0) return null;

    const target = this.patrolTargets[this.patrolIndex % this.patrolTargets.length];
    this.patrolIndex = (this.patrolIndex + 1) % this.patrolTargets.length;
    return target.clone();
  }

  /**
   * Add role-specific accessories based on the NPC colour.
   */
  private addRoleAccessory(color: number): void {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    if (r > 180 && g < 80 && b < 80) {
      // --- Red NPC (dragon): small wing-like shapes on back ---
      const wingGeo = new THREE.PlaneGeometry(0.5, 0.6, 1, 1);
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x881111,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });

      const leftWing = new THREE.Mesh(wingGeo, wingMat);
      leftWing.position.set(-0.35, 1.9, -0.2);
      leftWing.rotation.y = -0.5;
      leftWing.rotation.z = 0.3;
      this.mesh.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, wingMat);
      rightWing.position.set(0.35, 1.9, -0.2);
      rightWing.rotation.y = 0.5;
      rightWing.rotation.z = -0.3;
      this.mesh.add(rightWing);
    } else if (g > 140 && r < 120 && b < 120) {
      // --- Green NPC (merchant): backpack ---
      const packGeo = new THREE.BoxGeometry(0.3, 0.4, 0.25);
      const packMat = new THREE.MeshStandardMaterial({ color: 0x6b4226 });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.set(0, 1.65, -0.32);
      pack.castShadow = true;
      this.mesh.add(pack);
    } else if (r > 100 && b > 100 && g < 80) {
      // --- Purple NPC (sage): staff held to the side ---
      const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
      const staffMat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      staff.position.set(0.5, 1.3, 0);
      this.mesh.add(staff);

      // Staff orb on top
      const orbGeo = new THREE.SphereGeometry(0.08, 8, 6);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0xaa66ff,
        emissive: 0x6633aa,
        emissiveIntensity: 0.8,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(0.5, 2.45, 0);
      this.mesh.add(orb);
    } else if (r < 140 && g < 140 && b < 140 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
      // --- Gray NPC (guard): shield on one arm ---
      const shieldGeo = new THREE.CircleGeometry(0.25, 8);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: 0x888899,
        side: THREE.DoubleSide,
        metalness: 0.6,
        roughness: 0.3,
      });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.position.set(-0.45, 1.4, 0.1);
      shield.rotation.y = Math.PI / 2;
      this.mesh.add(shield);
    } else if (r > 180 && g > 180 && b < 100) {
      // --- Yellow NPC (healer): halo above head ---
      const haloGeo = new THREE.TorusGeometry(0.22, 0.03, 6, 24);
      const haloMat = new THREE.MeshStandardMaterial({
        color: 0xffdd44,
        emissive: 0xffdd44,
        emissiveIntensity: 1.0,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = 2.85;
      halo.rotation.x = Math.PI / 2;
      this.mesh.add(halo);
    }
  }
}

/** Darken a hex colour by a factor (0-1). */
function darken(hex: number, amount: number): number {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return c.getHex();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
