import * as THREE from 'three';
import { Water } from '../scene/Water';
import type { NPCAnimator } from './NPCAnimator';
import type { NPCMotionProfile } from './NPCMotion';

type CollisionSystem = { isPositionBlocked: (x: number, y: number, z: number, halfExtent?: number) => boolean };

export class NPCWander {
  private wanderTarget = new THREE.Vector3();
  private hasWanderTarget = false;
  private wanderCooldown: number;
  private isWandering = false;
  private patrolTargets: THREE.Vector3[] = [];
  private patrolIndex = 0;
  private readonly patrolSeed: number;

  private approachTarget: THREE.Vector3 | null = null;
  private onArrive: (() => void) | null = null;

  constructor(
    private readonly mesh: THREE.Group,
    private readonly position: THREE.Vector3,
    private readonly motionProfile: NPCMotionProfile,
    private readonly animator: NPCAnimator,
    id: string,
  ) {
    this.patrolSeed = hashString(id);
    this.wanderCooldown = -Math.random() * 3; // start expired so NPC moves immediately on first update
  }

  update(
    delta: number,
    getHeightAt: (x: number, z: number) => number,
    collisionSystem: CollisionSystem | undefined,
    wanderRadius: number,
    homePosition: THREE.Vector3,
    waterHoverY: number,
  ): void {
    this.tryResolveStuck(getHeightAt, collisionSystem);

    // --- Approach mode: walking toward player or a specific point ---
    if (this.approachTarget) {
      const dx = this.approachTarget.x - this.mesh.position.x;
      const dz = this.approachTarget.z - this.mesh.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < 2.25) {
        this.arrived();
        return;
      }
      this.walkToward(dx, dz, delta, getHeightAt);
      return;
    }

    if (!this.isWandering) {
      this.wanderCooldown -= delta;
      if (this.wanderCooldown <= 0) {
        const next = this.pickTarget(getHeightAt, collisionSystem, wanderRadius, homePosition);
        if (!next) {
          this.wanderCooldown = this.nextCooldown();
          return;
        }
        this.wanderTarget.copy(next);
        this.hasWanderTarget = true;
        this.isWandering = true;
        this.animator.play('walk');
      }
      return;
    }

    if (!this.hasWanderTarget) return;

    const dx = this.wanderTarget.x - this.mesh.position.x;
    const dz = this.wanderTarget.z - this.mesh.position.z;
    const distSq = dx * dx + dz * dz;

    if (distSq < 0.25) {
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

    if (this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, nextX, nextZ, 0.55, getHeightAt, collisionSystem)) {
      const heading = Math.atan2(nz, nx);
      let foundDetour = false;
      for (let probe = 1; probe <= 10; probe++) {
        const side = probe % 2 === 0 ? -1 : 1;
        const stepBand = Math.ceil(probe / 2);
        const angle = heading + side * stepBand * 0.18;
        const px = this.mesh.position.x + Math.cos(angle) * step;
        const pz = this.mesh.position.z + Math.sin(angle) * step;
        const py = getHeightAt(px, pz);
        if (!this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, px, pz, 0.55, getHeightAt, collisionSystem)) {
          nextX = px; nextZ = pz; nextY = py; foundDetour = true; break;
        }
      }
      if (!foundDetour) {
        const reTarget = this.pickTarget(getHeightAt, collisionSystem, wanderRadius, homePosition);
        if (reTarget) { this.wanderTarget.copy(reTarget); return; }
        this.isWandering = false;
        this.hasWanderTarget = false;
        this.wanderCooldown = Math.min(0.5, this.nextCooldown());
        this.animator.play('idle');
        return;
      }
    }

    if (nextY < Water.LEVEL + 0.05) nextY = waterHoverY;

    this.mesh.position.x = nextX;
    this.mesh.position.z = nextZ;
    this.mesh.position.y = nextY;
    this.position.copy(this.mesh.position);

    const targetAngle = Math.atan2(nx, nz);
    this.mesh.rotation.y = lerpAngle(
      this.mesh.rotation.y, targetAngle,
      Math.min(1, this.motionProfile.turnSpeed * delta),
    );
    this.animator.setBaseY(this.mesh.position.y);
  }

  walkTo(target: THREE.Vector3, onArrive?: () => void): void {
    this.isWandering = false;
    this.hasWanderTarget = false;
    this.approachTarget = target.clone();
    this.onArrive = onArrive ?? null;
    this.animator.play('walk');
  }

  updateApproachTarget(target: THREE.Vector3): void {
    if (this.approachTarget) {
      this.approachTarget.copy(target);
    }
  }

  resumeWander(): void {
    this.approachTarget = null;
    this.onArrive = null;
    this.isWandering = false;
    this.hasWanderTarget = false;
    this.wanderCooldown = this.nextCooldown();
    this.animator.setStill(false);
    this.animator.play('idle');
  }

  private arrived(): void {
    this.approachTarget = null;
    this.isWandering = false;
    this.hasWanderTarget = false;
    this.wanderCooldown = 9999;
    this.animator.setStill(true);
    this.animator.play('idle');
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  private walkToward(dx: number, dz: number, delta: number, getHeightAt: (x: number, z: number) => number): void {
    const dist = Math.sqrt(dx * dx + dz * dz);
    const speed = this.motionProfile.moveSpeed * 1.5;
    const step = Math.min(speed * delta, dist);
    const nx = dx / dist;
    const nz = dz / dist;
    const nextX = this.mesh.position.x + nx * step;
    const nextZ = this.mesh.position.z + nz * step;
    const nextY = getHeightAt(nextX, nextZ);

    this.mesh.position.x = nextX;
    this.mesh.position.z = nextZ;
    this.mesh.position.y = nextY;
    this.position.copy(this.mesh.position);

    const targetAngle = Math.atan2(nx, nz);
    this.mesh.rotation.y = lerpAngle(
      this.mesh.rotation.y, targetAngle,
      Math.min(1, this.motionProfile.turnSpeed * delta),
    );
    this.animator.setBaseY(this.mesh.position.y);
  }

  private nextCooldown(): number {
    return this.motionProfile.pauseMin + Math.random() * (this.motionProfile.pauseMax - this.motionProfile.pauseMin);
  }

  private pickTarget(
    getHeightAt: (x: number, z: number) => number,
    collisionSystem: CollisionSystem | undefined,
    wanderRadius: number,
    homePosition: THREE.Vector3,
  ): THREE.Vector3 | null {
    if (this.motionProfile.style === 'patrol') {
      return this.pickPatrolTarget(getHeightAt, collisionSystem, wanderRadius, homePosition);
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * wanderRadius;
      const tx = homePosition.x + Math.cos(angle) * dist;
      const tz = homePosition.z + Math.sin(angle) * dist;
      const ty = getHeightAt(tx, tz);
      if (collisionSystem?.isPositionBlocked(tx, ty, tz, 0.55)) continue;
      if (this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, tx, tz, 0.55, getHeightAt, collisionSystem)) continue;
      return new THREE.Vector3(tx, ty, tz);
    }
    return null;
  }

  private pickPatrolTarget(
    getHeightAt: (x: number, z: number) => number,
    collisionSystem: CollisionSystem | undefined,
    wanderRadius: number,
    homePosition: THREE.Vector3,
  ): THREE.Vector3 | null {
    if (this.patrolTargets.length === 0) {
      const points = Math.max(2, this.motionProfile.patrolPoints);
      const rng = seededRandom(this.patrolSeed);
      const baseAngle = rng() * Math.PI * 2;
      for (let i = 0; i < points; i++) {
        const angle = baseAngle + (i / points) * Math.PI * 2;
        const radius = wanderRadius * (0.55 + rng() * 0.35);
        const tx = homePosition.x + Math.cos(angle) * radius;
        const tz = homePosition.z + Math.sin(angle) * radius;
        const ty = getHeightAt(tx, tz);
        if (collisionSystem?.isPositionBlocked(tx, ty, tz, 0.55)) continue;
        this.patrolTargets.push(new THREE.Vector3(tx, ty, tz));
      }
    }
    if (this.patrolTargets.length === 0) return null;
    const target = this.patrolTargets[this.patrolIndex % this.patrolTargets.length];
    this.patrolIndex = (this.patrolIndex + 1) % this.patrolTargets.length;
    if (this.isPathBlocked(this.mesh.position.x, this.mesh.position.z, target.x, target.z, 0.55, getHeightAt, collisionSystem)) return null;
    return target.clone();
  }

  private isPathBlocked(
    fromX: number, fromZ: number, toX: number, toZ: number, halfExtent: number,
    getHeightAt: (x: number, z: number) => number,
    collisionSystem: CollisionSystem | undefined,
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

  private tryResolveStuck(
    getHeightAt: (x: number, z: number) => number,
    collisionSystem: CollisionSystem | undefined,
  ): void {
    if (!collisionSystem) return;
    const cx = this.mesh.position.x;
    const cz = this.mesh.position.z;
    const cy = getHeightAt(cx, cz);
    if (!collisionSystem.isPositionBlocked(cx, cy, cz, 0.55)) return;
    const angleOffset = (this.patrolSeed % 360) * THREE.MathUtils.DEG2RAD;
    for (let ring = 1; ring <= 5; ring++) {
      const radius = ring * 0.5;
      const samples = 12 + ring * 2;
      for (let i = 0; i < samples; i++) {
        const angle = angleOffset + (i / samples) * Math.PI * 2;
        const nx = cx + Math.cos(angle) * radius;
        const nz = cz + Math.sin(angle) * radius;
        const ny = getHeightAt(nx, nz);
        if (collisionSystem.isPositionBlocked(nx, ny, nz, 0.55)) continue;
        this.mesh.position.set(nx, ny, nz);
        this.position.copy(this.mesh.position);
        this.animator.setBaseY(ny);
        return;
      }
    }
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
