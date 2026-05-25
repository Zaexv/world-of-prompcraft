import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NPCAnimator } from './NPCAnimator';
import { createNPCMotionProfile, type NPCMotionProfile, type NPCMotionSource } from './NPCMotion';
import { addOutlineShell } from './ModelStyling';
import { Nameplate } from '../ui/Nameplate';
import { ActionIcon } from '../ui/ActionIcon';
import { getNPCModelPath, getNPCPlaceholderStyle, type NPCPlaceholderStyle } from './NPCModels';
import { buildProceduralMesh, getPlaceholderAppearance } from './NPCAppearance';
import type { AssetLoader } from '../utils/asset/AssetLoader';
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

    // Build procedural mesh and collect materials
    this.materials = buildProceduralMesh(this.mesh, appearance, color);

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
    this.actionIcon.displayAction(emote, 2.5);
  }

  /** Show an action icon above this NPC (e.g. when performing a tool action). */
  showAction(actionKind: string, duration = 3.0): void {
    this.actionIcon.displayAction(actionKind, duration);
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
        const dragonGreen = 0x1f4520;
        const darkGreen   = 0x0e2010;
        const boneBlack   = 0x0a1808;

        // ── Neck ──────────────────────────────────────────────────────────────
        const neckGeo = new THREE.CylinderGeometry(0.21, 0.3, 0.55, 8);
        const neckMat = new THREE.MeshStandardMaterial({ color: dragonGreen, flatShading: true });
        const neck = new THREE.Mesh(neckGeo, neckMat);
        neck.name = 'neck';
        neck.position.set(0, 2.48, 0.06);
        neck.rotation.x = -0.18;
        this.mesh.add(neck);

        // ── Snout (box extending forward from head) ────────────────────────
        const snoutGeo = new THREE.BoxGeometry(0.3, 0.2, 0.42);
        const snoutMat = new THREE.MeshStandardMaterial({ color: 0x2d5a24, flatShading: true });
        const snout = new THREE.Mesh(snoutGeo, snoutMat);
        snout.name = 'snout';
        snout.position.set(0, 2.64, 0.34);
        this.mesh.add(snout);

        // Lower jaw
        const jawGeo = new THREE.BoxGeometry(0.26, 0.1, 0.3);
        const jaw = new THREE.Mesh(jawGeo, snoutMat);
        jaw.name = 'jaw';
        jaw.position.set(0, 2.52, 0.3);
        this.mesh.add(jaw);

        // ── Glowing eyes ──────────────────────────────────────────────────
        const eyeGeo = new THREE.SphereGeometry(0.055, 8, 6);
        const eyeMat = new THREE.MeshStandardMaterial({
          color: 0xff8800,
          emissive: 0xff4400,
          emissiveIntensity: 2.2,
          flatShading: true,
        });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.name = 'leftEye';
        leftEye.position.set(-0.1, 2.73, 0.24);
        this.mesh.add(leftEye);
        const rightEye = leftEye.clone();
        rightEye.name = 'rightEye';
        rightEye.position.set(0.1, 2.73, 0.24);
        this.mesh.add(rightEye);

        // ── Back horns (two large prominent cones) ─────────────────────────
        const hornGeo = new THREE.ConeGeometry(0.07, 0.5, 6);
        const hornMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
        const leftHorn = new THREE.Mesh(hornGeo, hornMat);
        leftHorn.name = 'leftHorn';
        leftHorn.position.set(-0.13, 3.04, -0.06);
        leftHorn.rotation.z = -0.28;
        leftHorn.rotation.x = -0.12;
        this.mesh.add(leftHorn);
        const rightHorn = new THREE.Mesh(hornGeo, hornMat);
        rightHorn.name = 'rightHorn';
        rightHorn.position.set(0.13, 3.04, -0.06);
        rightHorn.rotation.z = 0.28;
        rightHorn.rotation.x = -0.12;
        this.mesh.add(rightHorn);

        // ── Spine ridge spikes ─────────────────────────────────────────────
        const ridgeMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
        const spineData = [
          { y: 2.55, z: -0.25, s: 0.22 },
          { y: 2.32, z: -0.26, s: 0.2  },
          { y: 2.08, z: -0.27, s: 0.18 },
          { y: 1.82, z: -0.27, s: 0.16 },
          { y: 1.55, z: -0.26, s: 0.13 },
        ];
        for (const [i, d] of spineData.entries()) {
          const sGeo = new THREE.ConeGeometry(0.038, d.s, 5);
          const spike = new THREE.Mesh(sGeo, ridgeMat);
          spike.name = `spineSpike${i}`;
          spike.position.set(0, d.y, d.z);
          spike.rotation.x = -0.38;
          this.mesh.add(spike);
        }

        // ── Tail (four tapering cylinder segments + tip spike) ─────────────
        const tailMat = new THREE.MeshStandardMaterial({ color: dragonGreen, flatShading: true });
        const tailData = [
          { rT: 0.17, rB: 0.22, h: 0.52, y: 0.92, z: -0.46, rx: 0.75 },
          { rT: 0.11, rB: 0.17, h: 0.5,  y: 0.5,  z: -0.9,  rx: 1.05 },
          { rT: 0.06, rB: 0.11, h: 0.44, y: 0.19, z: -1.22, rx: 0.65 },
          { rT: 0.02, rB: 0.06, h: 0.34, y: 0.06, z: -1.5,  rx: 0.22 },
        ];
        for (const [i, d] of tailData.entries()) {
          const tGeo = new THREE.CylinderGeometry(d.rT, d.rB, d.h, 8);
          const seg = new THREE.Mesh(tGeo, tailMat);
          seg.name = `tail${i}`;
          seg.position.set(0, d.y, d.z);
          seg.rotation.x = d.rx;
          this.mesh.add(seg);
        }
        const tailSpikeGeo = new THREE.ConeGeometry(0.04, 0.3, 4);
        const tailSpike = new THREE.Mesh(tailSpikeGeo, ridgeMat);
        tailSpike.name = 'tailSpike';
        tailSpike.position.set(0, 0.0, -1.65);
        tailSpike.rotation.x = Math.PI * 0.72;
        this.mesh.add(tailSpike);

        // ── Bat wings (custom ShapeGeometry) ──────────────────────────────
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0x0c2a0e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          flatShading: true,
        });

        // Left wing shape (local XY plane; attachment at 0,0)
        const lwShape = new THREE.Shape();
        lwShape.moveTo(0, 0);
        lwShape.lineTo(-1.5, 0.75);  // primary wingtip
        lwShape.lineTo(-1.1, 0.08);  // first notch
        lwShape.lineTo(-1.55, -0.38); // middle finger
        lwShape.lineTo(-1.05, -0.58); // second notch
        lwShape.lineTo(-0.65, -0.82); // lower finger
        lwShape.lineTo(-0.1, -0.52); // base lower
        lwShape.lineTo(0, 0);
        const lwGeo = new THREE.ShapeGeometry(lwShape);
        const leftWing = new THREE.Mesh(lwGeo, wingMat);
        leftWing.name = 'leftWing';
        leftWing.position.set(-0.42, 2.2, 0.0);
        leftWing.rotation.y = 0.25;
        leftWing.rotation.x = 0.12;
        this.mesh.add(leftWing);

        // Right wing (mirror of left)
        const rwShape = new THREE.Shape();
        rwShape.moveTo(0, 0);
        rwShape.lineTo(1.5, 0.75);
        rwShape.lineTo(1.1, 0.08);
        rwShape.lineTo(1.55, -0.38);
        rwShape.lineTo(1.05, -0.58);
        rwShape.lineTo(0.65, -0.82);
        rwShape.lineTo(0.1, -0.52);
        rwShape.lineTo(0, 0);
        const rwGeo = new THREE.ShapeGeometry(rwShape);
        const rightWing = new THREE.Mesh(rwGeo, wingMat);
        rightWing.name = 'rightWing';
        rightWing.position.set(0.42, 2.2, 0.0);
        rightWing.rotation.y = -0.25;
        rightWing.rotation.x = 0.12;
        this.mesh.add(rightWing);

        // Wing bones — three fingers per wing (cylindrical spars)
        const wbMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
        // [angle from attachment, length] for each finger
        const wbData: Array<[number, number]> = [
          [2.65, 1.0],  // primary (up-left)
          [3.0,  0.88], // mid (left)
          [3.35, 0.72], // lower (down-left)
        ];
        for (const [i, [angle, len]] of wbData.entries()) {
          const bGeo = new THREE.CylinderGeometry(0.018, 0.032, len, 5);
          // Left bone
          const lb = new THREE.Mesh(bGeo, wbMat);
          lb.name = `leftWingBone${i}`;
          lb.position.set(
            -0.42 + Math.cos(angle) * len * 0.5,
            2.2   + Math.sin(angle) * len * 0.5,
            0.0,
          );
          lb.rotation.z = -angle + Math.PI * 0.5;
          this.mesh.add(lb);
          // Right bone (mirror)
          const rb = new THREE.Mesh(bGeo, wbMat);
          rb.name = `rightWingBone${i}`;
          rb.position.set(
            0.42 - Math.cos(angle) * len * 0.5,
            2.2  + Math.sin(angle) * len * 0.5,
            0.0,
          );
          rb.rotation.z = angle - Math.PI * 0.5;
          this.mesh.add(rb);
        }

        // ── Belly scale plates (flattened ellipsoids along front of torso) ──
        const bellyMat = new THREE.MeshStandardMaterial({ color: 0x3a6830, flatShading: true });
        for (let i = 0; i < 5; i++) {
          const bsGeo = new THREE.SphereGeometry(0.13, 6, 4);
          bsGeo.scale(1.1, 0.28, 1.0);
          const bs = new THREE.Mesh(bsGeo, bellyMat);
          bs.name = `bellyScale${i}`;
          bs.position.set(0, 1.1 + i * 0.28, 0.4);
          this.mesh.add(bs);
        }

        // ── Claws (tiny cone tips on each leg) ────────────────────────────
        const clawMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
        for (const side of [-1, 1]) {
          for (let c = 0; c < 3; c++) {
            const cGeo = new THREE.ConeGeometry(0.025, 0.12, 4);
            const claw = new THREE.Mesh(cGeo, clawMat);
            claw.name = `claw_${side > 0 ? 'r' : 'l'}${c}`;
            claw.position.set(side * (0.14 + c * 0.05), 0.1, 0.08 - c * 0.06);
            claw.rotation.x = -0.6;
            claw.rotation.z = side * c * 0.2;
            this.mesh.add(claw);
          }
        }

        // Suppress unused-var lint for darkGreen (used implicitly via tailMat + neckMat)
        void darkGreen;
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
        const bonePale   = 0xc8d0b8;
        const boneWhite  = 0xdde4cc;
        const soulGreen  = 0x44ffaa;

        // ── Skull dome (wide flat cylinder on top of head) ─────────────────
        const domeGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.08, 10);
        const domeMat = new THREE.MeshStandardMaterial({ color: bonePale, flatShading: true });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.name = 'skullDome';
        dome.position.set(0, 2.72, 0);
        this.mesh.add(dome);

        // ── Jaw (box protruding below the head) ───────────────────────────
        const jawGeo = new THREE.BoxGeometry(0.3, 0.12, 0.28);
        const jaw = new THREE.Mesh(jawGeo, domeMat);
        jaw.name = 'jaw';
        jaw.position.set(0, 2.3, 0.1);
        this.mesh.add(jaw);

        // Skull teeth (4 small boxes along jaw)
        const toothMat = new THREE.MeshStandardMaterial({ color: boneWhite, flatShading: true });
        for (let i = 0; i < 4; i++) {
          const tGeo = new THREE.BoxGeometry(0.05, 0.07, 0.04);
          const tooth = new THREE.Mesh(tGeo, toothMat);
          tooth.name = `tooth${i}`;
          tooth.position.set(-0.09 + i * 0.06, 2.25, 0.23);
          this.mesh.add(tooth);
        }

        // ── Glowing hollow eye sockets ─────────────────────────────────────
        const eyeGeo = new THREE.SphereGeometry(0.055, 8, 6);
        const eyeMat = new THREE.MeshStandardMaterial({
          color: soulGreen,
          emissive: soulGreen,
          emissiveIntensity: 2.2,
          flatShading: true,
        });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.name = 'leftEye';
        leftEye.position.set(-0.08, 2.5, 0.18);
        this.mesh.add(leftEye);
        const rightEye = leftEye.clone();
        rightEye.name = 'rightEye';
        rightEye.position.set(0.08, 2.5, 0.18);
        this.mesh.add(rightEye);

        // ── Rib cage (4 pairs of curved bone strips) ──────────────────────
        const ribMat = new THREE.MeshStandardMaterial({ color: bonePale, flatShading: true });
        for (let r = 0; r < 4; r++) {
          const ribY = 1.9 + r * 0.17;
          for (const side of [-1, 1]) {
            const rGeo = new THREE.BoxGeometry(0.26, 0.04, 0.06);
            const rib = new THREE.Mesh(rGeo, ribMat);
            rib.name = `rib${r}${side > 0 ? 'r' : 'l'}`;
            rib.position.set(side * 0.15, ribY, 0.1);
            rib.rotation.z = side * -0.5;
            rib.rotation.y = side * 0.35;
            this.mesh.add(rib);
          }
        }

        // ── Visible spine knobs along back ────────────────────────────────
        const knobMat = new THREE.MeshStandardMaterial({ color: 0xb8c0a8, flatShading: true });
        for (let k = 0; k < 5; k++) {
          const kGeo = new THREE.SphereGeometry(0.04, 6, 4);
          const knob = new THREE.Mesh(kGeo, knobMat);
          knob.name = `spineKnob${k}`;
          knob.position.set(0, 1.1 + k * 0.25, -0.22);
          this.mesh.add(knob);
        }

        // ── Soul fire — glowing orb inside chest (visible through gaps) ───
        const soulGeo = new THREE.SphereGeometry(0.1, 8, 6);
        const soulMat = new THREE.MeshStandardMaterial({
          color: soulGreen,
          emissive: 0x22cc88,
          emissiveIntensity: 2.0,
          transparent: true,
          opacity: 0.7,
        });
        const soul = new THREE.Mesh(soulGeo, soulMat);
        soul.name = 'soulFire';
        soul.position.set(0, 1.82, 0);
        this.mesh.add(soul);

        // ── Wisp orbs — small emissive spheres orbiting the figure ────────
        const wispMat = new THREE.MeshStandardMaterial({
          color: 0x88ffcc,
          emissive: 0x44ffaa,
          emissiveIntensity: 2.0,
          transparent: true,
          opacity: 0.65,
        });
        const wispPositions: Array<[number, number, number]> = [
          [ 0.38,  2.7,  0.18],
          [-0.32,  2.1,  0.12],
          [ 0.2,   1.4, -0.28],
        ];
        for (const [i, [wx, wy, wz]] of wispPositions.entries()) {
          const wGeo = new THREE.SphereGeometry(0.05, 6, 4);
          const wisp = new THREE.Mesh(wGeo, wispMat);
          wisp.name = `wisp${i}`;
          wisp.position.set(wx, wy, wz);
          this.mesh.add(wisp);
        }

        // ── Main cloak (large, back-facing plane) ─────────────────────────
        const cloakMat = new THREE.MeshStandardMaterial({
          color: 0x1a1e1a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.82,
          flatShading: true,
        });
        const cloakGeo = new THREE.PlaneGeometry(0.64, 1.45, 1, 5);
        const cloak = new THREE.Mesh(cloakGeo, cloakMat);
        cloak.name = 'cloak';
        cloak.position.set(0, 1.45, -0.25);
        this.mesh.add(cloak);

        // Secondary inner cloak layer (slightly narrower, different tint)
        const cloakInnerMat = new THREE.MeshStandardMaterial({
          color: 0x2a3a2a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
          flatShading: true,
        });
        const cloakInnerGeo = new THREE.PlaneGeometry(0.44, 1.2, 1, 4);
        const cloakInner = new THREE.Mesh(cloakInnerGeo, cloakInnerMat);
        cloakInner.name = 'cloakInner';
        cloakInner.position.set(0, 1.5, -0.22);
        cloakInner.rotation.y = 0.05;
        this.mesh.add(cloakInner);

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
      'body', 'head', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm',
      'belt', 'hat', 'cloak', 'cloakInner',
      'leftShoulder', 'rightShoulder',
      // dragon
      'neck', 'snout', 'jaw', 'leftWing', 'rightWing',
      // undead
      'skullDome', 'soulFire',
      // shared accessories
      'shield', 'halo', 'staff', 'orb',
      'leftTusk', 'rightTusk',
      'leftEye', 'rightEye',
      'pack', 'satchel',
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

