import * as THREE from 'three';

/**
 * PlayerRig — the set of bones/parts an animation may drive. Decoupled from the
 * Player entity so animations live in their own modules (see ./poses, and
 * ./PlayerAnimator). Add new rigs here and new animations under ./poses.
 */
export interface PlayerRig {
  group: THREE.Group;        // root (yaw / world placement)
  visualRoot: THREE.Object3D; // body root (lean / bob / squash)
  leftLeg: THREE.Mesh | null;
  rightLeg: THREE.Mesh | null;
  leftArm: THREE.Mesh | null;
  rightArm: THREE.Mesh | null;
  cloak: THREE.Mesh | null;
  head: THREE.Mesh | null;
}

/** Pull the named parts out of a built character group into a PlayerRig. */
export function extractPlayerRig(group: THREE.Group, visualRoot: THREE.Object3D): PlayerRig {
  const get = (name: string): THREE.Mesh | null => (group.getObjectByName(name) as THREE.Mesh) ?? null;
  return {
    group,
    visualRoot,
    leftLeg: get('leftLeg'),
    rightLeg: get('rightLeg'),
    leftArm: get('leftArm'),
    rightArm: get('rightArm'),
    cloak: get('cloak'),
    head: get('head'),
  };
}

// ── Shared animation math ─────────────────────────────────────────────────────

/** Frame-rate-independent lerp factor for a given approach speed. */
export function clampedT(delta: number, speed: number): number {
  return Math.min(1, delta * speed);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Shortest signed difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
