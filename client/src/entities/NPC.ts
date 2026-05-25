import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NPCAnimator } from './NPCAnimator';
import { createNPCMotionProfile, type NPCMotionProfile, type NPCMotionSource } from './NPCMotion';
import { addOutlineShell } from './ModelStyling';
import { Nameplate } from '../ui/Nameplate';
import { ActionIcon } from '../ui/ActionIcon';
import { getNPCModelPath, getNPCPlaceholderStyle, type NPCPlaceholderStyle } from './NPCModels';
import type { AssetLoader } from '../utils/AssetLoader';
import { Water } from '../scene/Water';

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
  private readonly placeholderStyle: NPCPlaceholderStyle;
  private wanderTarget: THREE.Vector3 = new THREE.Vector3();
  private hasWanderTarget = false;
  private wanderCooldown: number;
  private isWandering = false;
  private patrolTargets: THREE.Vector3[] = [];
  private patrolIndex = 0;
  private readonly patrolSeed: number;
  private waterHoverPhase = Math.random() * Math.PI * 2;
  private readonly waterHoverHeight = 0.9;
  private readonly waterHoverAmplitude = 0.08;

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
    this.placeholderStyle = getNPCPlaceholderStyle(config.id, config.name, config.behavior);
    this.wanderRadius = config.wanderRadius ?? this.motionProfile.wanderRadius;
    this.wanderCooldown = this.motionProfile.pauseMin + Math.random() * (this.motionProfile.pauseMax - this.motionProfile.pauseMin);
    this.patrolSeed = hashString(this.id);
    this.mesh = new THREE.Group();

    const color = config.color ?? 0xcc6633;
    const appearance = getPlaceholderAppearance(this.placeholderStyle);

    // ----- Body (taller cylinder to match improved player) -----
    const bodyGeo = new THREE.CylinderGeometry(
      appearance.bodyTopRadius,
      appearance.bodyBottomRadius,
      appearance.bodyHeight,
      appearance.bodySegments,
    );
    const bodyMat = new THREE.MeshStandardMaterial({
      color: appearance.bodyColor ?? color,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.02,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.name = 'body';
    body.position.y = appearance.bodyY;
    body.castShadow = true;
    this.mesh.add(body);
    this.materials.push(bodyMat);

    // ----- Shoulders (small spheres on each side) -----
    const shoulderGeo = new THREE.SphereGeometry(appearance.shoulderRadius, 8, 6);
    const shoulderMat = new THREE.MeshStandardMaterial({
      color: darken(appearance.bodyColor ?? color, 0.15),
      flatShading: true,
      roughness: 0.9,
      metalness: 0.03,
    });
    const leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    leftShoulder.name = 'leftShoulder';
    leftShoulder.position.set(-appearance.shoulderOffset, appearance.shoulderY, 0);
    this.mesh.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    rightShoulder.name = 'rightShoulder';
    rightShoulder.position.set(appearance.shoulderOffset, appearance.shoulderY, 0);
    this.mesh.add(rightShoulder);
    this.materials.push(shoulderMat);

    // ----- Belt (thin torus around waist) -----
    const beltGeo = new THREE.TorusGeometry(appearance.beltRadius, appearance.beltTube, 6, 16);
    const beltMat = new THREE.MeshStandardMaterial({
      color: appearance.beltColor,
      flatShading: true,
      roughness: 0.72,
      metalness: 0.06,
    });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.name = 'belt';
    belt.position.y = appearance.beltY;
    belt.rotation.x = Math.PI / 2;
    this.mesh.add(belt);
    this.materials.push(beltMat);

    // ----- Head -----
    const headGeo = new THREE.SphereGeometry(appearance.headRadius, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({
      color: appearance.headColor,
      flatShading: true,
      roughness: 0.98,
      metalness: 0.0,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.name = 'head';
    head.position.y = appearance.headY;
    head.castShadow = true;
    this.mesh.add(head);
    this.materials.push(headMat);

    // ----- Legs (slightly longer) -----
    const legGeo = new THREE.BoxGeometry(appearance.legWidth, appearance.legHeight, appearance.legDepth);
    const legMat = new THREE.MeshStandardMaterial({
      color: appearance.legColor,
      flatShading: true,
      roughness: 0.96,
      metalness: 0.01,
    });

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.name = 'leftLeg';
    leftLeg.position.set(-appearance.legOffset, appearance.legY, 0);
    this.mesh.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.name = 'rightLeg';
    rightLeg.position.set(appearance.legOffset, appearance.legY, 0);
    this.mesh.add(rightLeg);

    this.materials.push(legMat);

    // ----- Hat / cone -----
    const hatGeo = new THREE.ConeGeometry(appearance.hatRadius, appearance.hatHeight, 8);
    const hatMat = new THREE.MeshStandardMaterial({
      color: appearance.hatColor ?? darken(color, 0.4),
      flatShading: true,
      roughness: 0.88,
      metalness: 0.03,
    });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.name = 'hat';
    hat.position.y = appearance.hatY;
    this.mesh.add(hat);
    this.materials.push(hatMat);

    // ----- Role-based accessories -----
    this.addPlaceholderAccessory(this.placeholderStyle);
    this.applyFlatShading();
    this.addVisualOutline(this.placeholderStyle);

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
      const modelPath = getNPCModelPath(config.id, config.name, config.behavior);
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

    // Scale the GLTF so it roughly matches the procedural NPC height (~2.5 units).
    // Normalize by height (Y) only so wide models aren't incorrectly shrunk.
    const gltfScene = gltf.scene.clone();
    const box = new THREE.Box3().setFromObject(gltfScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = 2.5 / Math.max(size.y, 0.001);
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

    // Add a subtle silhouette outline so GLTF models remain readable like procedural ones
    addOutlineShell(gltfScene, { scale: 1.03, opacity: 0.85 });

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
    this.waterHoverPhase += delta * 1.7;
    this.animator.update(delta);
    this.actionIcon.update(delta);
    if (this.mesh.position.y < Water.LEVEL + 0.2) {
      const hoverY = Water.LEVEL
        + this.waterHoverHeight
        + Math.sin(this.waterHoverPhase) * this.waterHoverAmplitude;
      this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, hoverY, Math.min(1, delta * 6));
      this.animator.setBaseY(this.mesh.position.y);
    }
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

    this.tryResolveStuckPosition(getHeightAt, collisionSystem);

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
      if (this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, nextX, nextZ, 0.55, getHeightAt, collisionSystem)) {
        const heading = Math.atan2(nz, nx);
        let foundDetour = false;

        for (let probe = 1; probe <= 10; probe++) {
          const side = probe % 2 === 0 ? -1 : 1;
          const stepBand = Math.ceil(probe / 2);
          const detourAngle = heading + side * stepBand * 0.18;
          const probeX = this.mesh.position.x + Math.cos(detourAngle) * step;
          const probeZ = this.mesh.position.z + Math.sin(detourAngle) * step;
          const probeY = getHeightAt(probeX, probeZ);

          if (!this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, probeX, probeZ, 0.55, getHeightAt, collisionSystem)) {
            nextX = probeX;
            nextZ = probeZ;
            nextY = probeY;
            foundDetour = true;
            break;
          }
        }

        if (!foundDetour) {
          const reTarget = this.pickWanderTarget(getHeightAt, collisionSystem);
          if (reTarget) {
            this.wanderTarget.copy(reTarget);
            return;
          }
          this.isWandering = false;
          this.hasWanderTarget = false;
          this.wanderCooldown = Math.min(0.5, this.nextCooldown());
          this.animator.play('idle');
          return;
        }
      }

      if (nextY < Water.LEVEL + 0.05) {
        nextY = Water.LEVEL
          + this.waterHoverHeight
          + Math.sin(this.waterHoverPhase) * this.waterHoverAmplitude;
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

    for (let attempt = 0; attempt < 12; attempt++) {
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
      if (this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, tx, tz, 0.55, getHeightAt, collisionSystem)) {
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
    if (this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, target.x, target.z, 0.55, getHeightAt, collisionSystem)) {
      return null;
    }
    return target.clone();
  }

  private isPathBlocked(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    halfExtent: number,
    getHeightAt: (x: number, z: number) => number,
    collisionSystem?: { isPositionBlocked: (x: number, y: number, z: number, halfExtent?: number) => boolean },
  ): boolean {
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
  }

  private tryResolveStuckPosition(
    getHeightAt: (x: number, z: number) => number,
    collisionSystem?: { isPositionBlocked: (x: number, y: number, z: number, halfExtent?: number) => boolean },
  ): void {
    if (!collisionSystem) return;
    const currentX = this.mesh.position.x;
    const currentZ = this.mesh.position.z;
    const currentY = getHeightAt(currentX, currentZ);
    if (!collisionSystem.isPositionBlocked(currentX, currentY, currentZ, 0.55)) return;

    const angleOffset = (this.patrolSeed % 360) * THREE.MathUtils.DEG2RAD;
    for (let ring = 1; ring <= 5; ring++) {
      const radius = ring * 0.5;
      const samples = 12 + ring * 2;
      for (let i = 0; i < samples; i++) {
        const angle = angleOffset + (i / samples) * Math.PI * 2;
        const nx = currentX + Math.cos(angle) * radius;
        const nz = currentZ + Math.sin(angle) * radius;
        const ny = getHeightAt(nx, nz);
        if (collisionSystem.isPositionBlocked(nx, ny, nz, 0.55)) continue;
        this.mesh.position.set(nx, ny, nz);
        this.position.copy(this.mesh.position);
        this.animator.setBaseY(ny);
        return;
      }
    }
  }

  /** Add low-poly accessories based on the NPC type name. */
  private addPlaceholderAccessory(style: NPCPlaceholderStyle): void {
    switch (style) {
      case 'dragon': {
        const wingGeo = new THREE.PlaneGeometry(0.5, 0.6, 1, 1);
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0x881111,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
          flatShading: true,
        });
        const leftWing = new THREE.Mesh(wingGeo, wingMat);
        leftWing.name = 'leftWing';
        leftWing.position.set(-0.35, 1.9, -0.2);
        leftWing.rotation.y = -0.5;
        leftWing.rotation.z = 0.3;
        this.mesh.add(leftWing);
        const rightWing = new THREE.Mesh(wingGeo, wingMat);
        rightWing.name = 'rightWing';
        rightWing.position.set(0.35, 1.9, -0.2);
        rightWing.rotation.y = 0.5;
        rightWing.rotation.z = -0.3;
        this.mesh.add(rightWing);
        break;
      }
      case 'monster': {
        const spikeGeo = new THREE.ConeGeometry(0.08, 0.22, 5);
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a2d, flatShading: true });
        for (let i = 0; i < 4; i++) {
          const spike = new THREE.Mesh(spikeGeo, spikeMat);
          spike.name = `spike${i}`;
          spike.position.set((i - 1.5) * 0.18, 2.02 + (i % 2) * 0.05, -0.1);
          spike.rotation.z = i % 2 === 0 ? 0.5 : -0.5;
          this.mesh.add(spike);
        }
        const clawGeo = new THREE.ConeGeometry(0.03, 0.16, 4);
        const clawMat = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, flatShading: true });
        const leftClaw = new THREE.Mesh(clawGeo, clawMat);
        leftClaw.name = 'leftClaw';
        leftClaw.position.set(-0.12, 0.95, 0.18);
        leftClaw.rotation.z = Math.PI * 0.25;
        this.mesh.add(leftClaw);
        const rightClaw = leftClaw.clone();
        rightClaw.name = 'rightClaw';
        rightClaw.position.x = 0.12;
        rightClaw.rotation.z = -Math.PI * 0.25;
        this.mesh.add(rightClaw);
        const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
        const eyeMat = new THREE.MeshStandardMaterial({
          color: 0xff5533,
          emissive: 0xff2211,
          emissiveIntensity: 1.4,
          flatShading: true,
        });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.name = 'leftEye';
        leftEye.position.set(-0.08, 2.36, 0.16);
        this.mesh.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.name = 'rightEye';
        rightEye.position.set(0.08, 2.36, 0.16);
        this.mesh.add(rightEye);
        break;
      }
      case 'merchant': {
        const packGeo = new THREE.BoxGeometry(0.3, 0.4, 0.25);
        const packMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, flatShading: true });
        const pack = new THREE.Mesh(packGeo, packMat);
        pack.name = 'pack';
        pack.position.set(0, 1.65, -0.32);
        pack.castShadow = true;
        this.mesh.add(pack);
        break;
      }
      case 'guard': {
        const shieldGeo = new THREE.CircleGeometry(0.25, 8);
        const shieldMat = new THREE.MeshStandardMaterial({
          color: 0x888899,
          side: THREE.DoubleSide,
          metalness: 0.6,
          roughness: 0.3,
          flatShading: true,
        });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.name = 'shield';
        shield.position.set(-0.45, 1.4, 0.1);
        shield.rotation.y = Math.PI / 2;
        this.mesh.add(shield);
        break;
      }
      case 'healer': {
        const haloGeo = new THREE.TorusGeometry(0.22, 0.03, 6, 24);
        const haloMat = new THREE.MeshStandardMaterial({
          color: 0xffdd44,
          emissive: 0xffdd44,
          emissiveIntensity: 1.0,
          flatShading: true,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.name = 'halo';
        halo.position.y = 2.85;
        halo.rotation.x = Math.PI / 2;
        this.mesh.add(halo);
        break;
      }
      case 'sage':
      case 'mage': {
        const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
        const staffMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, flatShading: true });
        const staff = new THREE.Mesh(staffGeo, staffMat);
        staff.name = 'staff';
        staff.position.set(0.5, 1.3, 0);
        this.mesh.add(staff);
        const orbGeo = new THREE.SphereGeometry(0.08, 8, 6);
        const orbMat = new THREE.MeshStandardMaterial({
          color: style === 'sage' ? 0xaa66ff : 0x66aaff,
          emissive: style === 'sage' ? 0x6633aa : 0x224477,
          emissiveIntensity: 0.8,
          flatShading: true,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.name = 'orb';
        orb.position.set(0.5, 2.45, 0);
        this.mesh.add(orb);
        break;
      }
      case 'pyromancer': {
        const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
        const staffMat = new THREE.MeshStandardMaterial({ color: 0x5a3020, flatShading: true });
        const staff = new THREE.Mesh(staffGeo, staffMat);
        staff.name = 'staff';
        staff.position.set(0.5, 1.3, 0);
        this.mesh.add(staff);
        // Flame-orb: bright orange/yellow emissive sphere
        const orbGeo = new THREE.SphereGeometry(0.1, 8, 6);
        const orbMat = new THREE.MeshStandardMaterial({
          color: 0xff6600,
          emissive: 0xff3300,
          emissiveIntensity: 1.6,
          flatShading: true,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.name = 'orb';
        orb.position.set(0.5, 2.45, 0);
        this.mesh.add(orb);
        // Small surrounding flame sparks
        const sparkGeo = new THREE.TetrahedronGeometry(0.05, 0);
        const sparkMat = new THREE.MeshStandardMaterial({
          color: 0xffaa00,
          emissive: 0xff6600,
          emissiveIntensity: 1.2,
          flatShading: true,
        });
        for (let i = 0; i < 3; i++) {
          const spark = new THREE.Mesh(sparkGeo, sparkMat);
          spark.name = `spark${i}`;
          const angle = (i / 3) * Math.PI * 2;
          spark.position.set(0.5 + Math.cos(angle) * 0.12, 2.45 + Math.sin(angle) * 0.1, Math.sin(angle) * 0.12);
          this.mesh.add(spark);
        }
        break;
      }
      case 'cryomancer': {
        const staffGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6);
        const staffMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, flatShading: true, metalness: 0.4, roughness: 0.3 });
        const staff = new THREE.Mesh(staffGeo, staffMat);
        staff.name = 'staff';
        staff.position.set(0.5, 1.3, 0);
        this.mesh.add(staff);
        // Ice crystal orb: pale blue emissive sphere
        const orbGeo = new THREE.OctahedronGeometry(0.1, 0);
        const orbMat = new THREE.MeshStandardMaterial({
          color: 0xaaddff,
          emissive: 0x5599cc,
          emissiveIntensity: 1.4,
          flatShading: true,
          metalness: 0.3,
          roughness: 0.2,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.name = 'orb';
        orb.position.set(0.5, 2.45, 0);
        this.mesh.add(orb);
        // Ice spike crown
        const spikeGeo = new THREE.ConeGeometry(0.04, 0.2, 4);
        const spikeMat = new THREE.MeshStandardMaterial({
          color: 0xcceeff,
          emissive: 0x3366aa,
          emissiveIntensity: 0.6,
          flatShading: true,
          transparent: true,
          opacity: 0.85,
        });
        for (let i = 0; i < 5; i++) {
          const spike = new THREE.Mesh(spikeGeo, spikeMat);
          spike.name = `iceSpike${i}`;
          const angle = (i / 5) * Math.PI * 2;
          spike.position.set(Math.cos(angle) * 0.15, 2.55, Math.sin(angle) * 0.15);
          spike.rotation.z = Math.PI * 0.1;
          this.mesh.add(spike);
        }
        break;
      }
      case 'orc': {
        const tuskGeo = new THREE.ConeGeometry(0.03, 0.14, 4);
        const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8d2b0, flatShading: true });
        const leftTusk = new THREE.Mesh(tuskGeo, tuskMat);
        leftTusk.name = 'leftTusk';
        leftTusk.position.set(-0.09, 2.08, 0.16);
        leftTusk.rotation.z = Math.PI * 0.3;
        this.mesh.add(leftTusk);
        const rightTusk = leftTusk.clone();
        rightTusk.name = 'rightTusk';
        rightTusk.position.x = 0.09;
        rightTusk.rotation.z = -Math.PI * 0.3;
        this.mesh.add(rightTusk);
        break;
      }
      case 'undead': {
        const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
        const eyeMat = new THREE.MeshStandardMaterial({
          color: 0x44ffaa,
          emissive: 0x44ffaa,
          emissiveIntensity: 1.6,
          flatShading: true,
        });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.name = 'leftEye';
        leftEye.position.set(-0.07, 2.38, 0.17);
        this.mesh.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.name = 'rightEye';
        rightEye.position.set(0.07, 2.38, 0.17);
        this.mesh.add(rightEye);
        const cloakGeo = new THREE.PlaneGeometry(0.5, 1.2, 1, 4);
        const cloakMat = new THREE.MeshStandardMaterial({
          color: 0x2c2c2c,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
          flatShading: true,
        });
        const cloak = new THREE.Mesh(cloakGeo, cloakMat);
        cloak.name = 'cloak';
        cloak.position.set(0, 1.4, -0.18);
        this.mesh.add(cloak);
        break;
      }
      case 'civilian':
      default: {
        const satchelGeo = new THREE.BoxGeometry(0.25, 0.3, 0.18);
        const satchelMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true });
        const satchel = new THREE.Mesh(satchelGeo, satchelMat);
        satchel.name = 'satchel';
        satchel.position.set(0.18, 1.3, -0.26);
        this.mesh.add(satchel);
        break;
      }
    }
  }

  private addVisualOutline(style: NPCPlaceholderStyle): void {
    const outlineNames: readonly string[] = [
      'body',
      'head',
      'leftLeg',
      'rightLeg',
      'leftArm',
      'rightArm',
      'belt',
      'hat',
      'cloak',
      'leftShoulder',
      'rightShoulder',
      'leftWing',
      'rightWing',
      'shield',
      'halo',
      'staff',
      'orb',
      'leftTusk',
      'rightTusk',
      'leftEye',
      'rightEye',
      'pack',
      'satchel',
    ];

    const scale = style === 'dragon' || style === 'monster' ? 1.06 : 1.045;
    addOutlineShell(this.mesh, {
      includeNames: outlineNames,
      scale,
      opacity: style === 'undead' ? 0.98 : 1,
    });
  }

  /** Force the procedural placeholder into a flat-shaded polygon look. */
  private applyFlatShading(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.flatShading = true;
            material.needsUpdate = true;
          }
        }
      }
    });
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

function getPlaceholderAppearance(style: NPCPlaceholderStyle): {
  bodyTopRadius: number;
  bodyBottomRadius: number;
  bodyHeight: number;
  bodyY: number;
  bodySegments: number;
  bodyColor: number;
  shoulderRadius: number;
  shoulderOffset: number;
  shoulderY: number;
  beltRadius: number;
  beltTube: number;
  beltY: number;
  beltColor: number;
  headRadius: number;
  headY: number;
  headColor: number;
  legWidth: number;
  legHeight: number;
  legDepth: number;
  legOffset: number;
  legY: number;
  legColor: number;
  hatRadius: number;
  hatHeight: number;
  hatY: number;
  hatColor?: number;
} {
  switch (style) {
    case 'merchant':
      return {
        bodyTopRadius: 0.36,
        bodyBottomRadius: 0.42,
        bodyHeight: 1.3,
        bodyY: 1.45,
        bodySegments: 10,
        bodyColor: 0xa67c52,
        shoulderRadius: 0.12,
        shoulderOffset: 0.28,
        shoulderY: 2.0,
        beltRadius: 0.34,
        beltTube: 0.04,
        beltY: 1.05,
        beltColor: 0x8b6914,
        headRadius: 0.24,
        headY: 2.26,
        headColor: 0xf3cfaf,
        legWidth: 0.15,
        legHeight: 0.62,
        legDepth: 0.15,
        legOffset: 0.12,
        legY: 0.42,
        legColor: 0x5d4037,
        hatRadius: 0.16,
        hatHeight: 0.3,
        hatY: 2.56,
      };
    case 'guard':
      return {
        bodyTopRadius: 0.42,
        bodyBottomRadius: 0.46,
        bodyHeight: 1.55,
        bodyY: 1.58,
        bodySegments: 10,
        bodyColor: 0x8b8f9c,
        shoulderRadius: 0.16,
        shoulderOffset: 0.4,
        shoulderY: 2.15,
        beltRadius: 0.37,
        beltTube: 0.045,
        beltY: 1.18,
        beltColor: 0x666677,
        headRadius: 0.26,
        headY: 2.5,
        headColor: 0xf2d0b0,
        legWidth: 0.17,
        legHeight: 0.72,
        legDepth: 0.17,
        legOffset: 0.15,
        legY: 0.45,
        legColor: 0x4b4f59,
        hatRadius: 0.1,
        hatHeight: 0.18,
        hatY: 2.96,
      };
    case 'healer':
      return {
        bodyTopRadius: 0.28,
        bodyBottomRadius: 0.32,
        bodyHeight: 1.45,
        bodyY: 1.5,
        bodySegments: 10,
        bodyColor: 0xc8b7a4,
        shoulderRadius: 0.12,
        shoulderOffset: 0.28,
        shoulderY: 2.06,
        beltRadius: 0.3,
        beltTube: 0.035,
        beltY: 1.08,
        beltColor: 0xffdd66,
        headRadius: 0.24,
        headY: 2.42,
        headColor: 0xf5d8be,
        legWidth: 0.13,
        legHeight: 0.68,
        legDepth: 0.13,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x7b6a5c,
        hatRadius: 0.16,
        hatHeight: 0.24,
        hatY: 2.72,
      };
    case 'sage':
    case 'mage':
      return {
        bodyTopRadius: 0.3,
        bodyBottomRadius: 0.34,
        bodyHeight: 1.5,
        bodyY: 1.53,
        bodySegments: 10,
        bodyColor: 0x4b3f7a,
        shoulderRadius: 0.12,
        shoulderOffset: 0.3,
        shoulderY: 2.08,
        beltRadius: 0.31,
        beltTube: 0.035,
        beltY: 1.1,
        beltColor: 0x553366,
        headRadius: 0.24,
        headY: 2.44,
        headColor: 0xe4cfbd,
        legWidth: 0.12,
        legHeight: 0.68,
        legDepth: 0.12,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x2f254d,
        hatRadius: 0.17,
        hatHeight: 0.4,
        hatY: 2.86,
      };
    case 'dragon':
      return {
        bodyTopRadius: 0.42,
        bodyBottomRadius: 0.48,
        bodyHeight: 1.6,
        bodyY: 1.6,
        bodySegments: 10,
        bodyColor: 0xc46a33,
        shoulderRadius: 0.16,
        shoulderOffset: 0.4,
        shoulderY: 2.16,
        beltRadius: 0.36,
        beltTube: 0.04,
        beltY: 1.14,
        beltColor: 0x6a2a12,
        headRadius: 0.27,
        headY: 2.56,
        headColor: 0xf1c08d,
        legWidth: 0.18,
        legHeight: 0.72,
        legDepth: 0.18,
        legOffset: 0.14,
        legY: 0.45,
        legColor: 0x5b2414,
        hatRadius: 0.14,
        hatHeight: 0.22,
        hatY: 3.0,
      };
    case 'monster':
      return {
        bodyTopRadius: 0.48,
        bodyBottomRadius: 0.54,
        bodyHeight: 1.48,
        bodyY: 1.48,
        bodySegments: 10,
        bodyColor: 0x5e5a42,
        shoulderRadius: 0.18,
        shoulderOffset: 0.42,
        shoulderY: 2.1,
        beltRadius: 0.34,
        beltTube: 0.04,
        beltY: 1.12,
        beltColor: 0x2f2f2f,
        headRadius: 0.23,
        headY: 2.34,
        headColor: 0xd8d0b0,
        legWidth: 0.18,
        legHeight: 0.68,
        legDepth: 0.18,
        legOffset: 0.14,
        legY: 0.44,
        legColor: 0x383522,
        hatRadius: 0.12,
        hatHeight: 0.2,
        hatY: 2.82,
      };
    case 'orc':
      return {
        bodyTopRadius: 0.44,
        bodyBottomRadius: 0.5,
        bodyHeight: 1.58,
        bodyY: 1.58,
        bodySegments: 10,
        bodyColor: 0x3d6b2a,
        shoulderRadius: 0.17,
        shoulderOffset: 0.42,
        shoulderY: 2.16,
        beltRadius: 0.38,
        beltTube: 0.045,
        beltY: 1.15,
        beltColor: 0x5f1f1f,
        headRadius: 0.27,
        headY: 2.5,
        headColor: 0xbda98a,
        legWidth: 0.18,
        legHeight: 0.72,
        legDepth: 0.18,
        legOffset: 0.15,
        legY: 0.45,
        legColor: 0x26491b,
        hatRadius: 0.1,
        hatHeight: 0.18,
        hatY: 2.96,
      };
    case 'undead':
      return {
        bodyTopRadius: 0.26,
        bodyBottomRadius: 0.3,
        bodyHeight: 1.45,
        bodyY: 1.5,
        bodySegments: 10,
        bodyColor: 0x586458,
        shoulderRadius: 0.11,
        shoulderOffset: 0.26,
        shoulderY: 2.02,
        beltRadius: 0.28,
        beltTube: 0.03,
        beltY: 1.06,
        beltColor: 0x1f1f1f,
        headRadius: 0.22,
        headY: 2.36,
        headColor: 0xbfd0bf,
        legWidth: 0.11,
        legHeight: 0.66,
        legDepth: 0.11,
        legOffset: 0.1,
        legY: 0.43,
        legColor: 0x434f43,
        hatRadius: 0.16,
        hatHeight: 0.3,
        hatY: 2.74,
      };
    case 'civilian':
    default:
      return {
        bodyTopRadius: 0.3,
        bodyBottomRadius: 0.35,
        bodyHeight: 1.4,
        bodyY: 1.5,
        bodySegments: 10,
        bodyColor: 0xcc6633,
        shoulderRadius: 0.14,
        shoulderOffset: 0.34,
        shoulderY: 2.05,
        beltRadius: 0.33,
        beltTube: 0.04,
        beltY: 1.1,
        beltColor: 0x8b6914,
        headRadius: 0.25,
        headY: 2.42,
        headColor: 0xf5cba7,
        legWidth: 0.16,
        legHeight: 0.65,
        legDepth: 0.16,
        legOffset: 0.13,
        legY: 0.42,
        legColor: 0x5d4037,
        hatRadius: 0.18,
        hatHeight: 0.35,
        hatY: 2.78,
      };
    case 'pyromancer':
      return {
        bodyTopRadius: 0.3,
        bodyBottomRadius: 0.34,
        bodyHeight: 1.5,
        bodyY: 1.53,
        bodySegments: 10,
        bodyColor: 0x7a2810,  // deep ember-red robe
        shoulderRadius: 0.12,
        shoulderOffset: 0.3,
        shoulderY: 2.08,
        beltRadius: 0.31,
        beltTube: 0.035,
        beltY: 1.1,
        beltColor: 0xcc4400,  // bright orange sash
        headRadius: 0.24,
        headY: 2.44,
        headColor: 0xe8b890,
        legWidth: 0.12,
        legHeight: 0.68,
        legDepth: 0.12,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x3c1408,
        hatRadius: 0.17,
        hatHeight: 0.4,
        hatY: 2.86,
        hatColor: 0x6a1a06,
      };
    case 'cryomancer':
      return {
        bodyTopRadius: 0.3,
        bodyBottomRadius: 0.34,
        bodyHeight: 1.5,
        bodyY: 1.53,
        bodySegments: 10,
        bodyColor: 0x2a4a7a,  // deep ice-blue robe
        shoulderRadius: 0.12,
        shoulderOffset: 0.3,
        shoulderY: 2.08,
        beltRadius: 0.31,
        beltTube: 0.035,
        beltY: 1.1,
        beltColor: 0x66aadd,  // icy silver-blue sash
        headRadius: 0.24,
        headY: 2.44,
        headColor: 0xe0ecf8,  // pale cool skin
        legWidth: 0.12,
        legHeight: 0.68,
        legDepth: 0.12,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x1a2a44,
        hatRadius: 0.17,
        hatHeight: 0.4,
        hatY: 2.86,
        hatColor: 0x1a3a5a,
      };
  }
}
