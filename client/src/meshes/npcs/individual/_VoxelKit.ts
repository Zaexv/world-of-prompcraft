/**
 * Shared voxel-character builder for hand-authored individual NPCs.
 *
 * The reference art (docs/assets/characters/*.png) is pure blocky voxel, so these
 * NPCs are built from boxes rather than the cylinder-limbed procedural base.
 *
 * Animation contract (NPCAnimator): the limb pivots are named `leftArm`,
 * `rightArm`, `leftLeg`, `rightLeg` and an optional `cloak`. The animator rotates
 * each around its LOCAL origin, so arms pivot at the shoulder and legs at the hip
 * for a natural swing; the cloak pivots at the shoulders so its hem trails.
 */
import * as THREE from 'three';
import { applyCharacterPBR } from '../../../utils/PBRMaps';
import {
  NPC_Y_LEG,
  NPC_Y_TORSO,
  NPC_Y_HEAD,
  NPC_TORSO_TOP,
} from '../../../entities/NPCAppearance';

const TORSO_H = 0.88;
const HEAD_H = 0.52;
const ARM_H = 0.66;
const LEG_H = 0.82;
const HAND_H = 0.16;
const FOOT_H = 0.18;

export interface MatOpts {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

/** Flat-shaded standard material — the house style for all characters. */
export function vmat(color: number, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0,
    flatShading: true,
  };
  if (opts.emissive !== undefined) {
    params.emissive = new THREE.Color(opts.emissive);
    params.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.transparent) {
    params.transparent = true;
    params.opacity = opts.opacity ?? 1;
  }
  return new THREE.MeshStandardMaterial(params);
}

/** Convenience box mesh. */
export function box(
  w: number, h: number, d: number,
  mat: THREE.Material,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export interface VoxelDims {
  torsoW: number;
  torsoD: number;
  torsoColor: number;
  headW: number;
  headD: number;
  skinColor: number;
  armW: number;
  armD: number;
  armColor: number;
  legW: number;
  legD: number;
  legColor: number;
  /** Hands default to skin; override for gloves. */
  handColor?: number;
  /** Feet default to leg colour; override for boots. */
  footColor?: number;
}

export interface VoxelRig {
  head: THREE.Mesh;
  body: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

/**
 * Build the animated voxel body into `group` and return references to each
 * named part so the caller can hang accessories (beard, armour, hat) on them.
 * Accessories parented to `head` nod with the head; those on the arm/leg pivots
 * swing with the limb.
 */
export function buildVoxelCharacter(group: THREE.Group, d: VoxelDims): VoxelRig {
  const skinMat = vmat(d.skinColor, { roughness: 0.55 });
  const handColor = d.handColor ?? d.skinColor;
  const footColor = d.footColor ?? d.legColor;

  // ── Torso ──
  const body = box(d.torsoW, TORSO_H, d.torsoD, vmat(d.torsoColor), 0, NPC_Y_TORSO, 0);
  body.name = 'body';
  group.add(body);

  // ── Head ──
  const head = box(d.headW, HEAD_H, d.headD, skinMat, 0, NPC_Y_HEAD, 0);
  head.name = 'head';
  group.add(head);

  // ── Arms (pivot at shoulder) ──
  const shoulderY = NPC_TORSO_TOP; // top of torso
  const armX = d.torsoW / 2 + d.armW / 2;
  const makeArm = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'leftArm' : 'rightArm';
    pivot.position.set(side * armX, shoulderY, 0);
    pivot.add(box(d.armW, ARM_H, d.armD, vmat(d.armColor), 0, -ARM_H / 2, 0));
    pivot.add(box(d.armW * 1.02, HAND_H, d.armD * 1.02, vmat(handColor, { roughness: 0.55 }), 0, -ARM_H - HAND_H / 2 + 0.02, 0));
    group.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // ── Legs (pivot at hip) ──
  const hipY = NPC_Y_LEG + LEG_H / 2;
  const legX = d.torsoW / 4;
  const makeLeg = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'leftLeg' : 'rightLeg';
    pivot.position.set(side * legX, hipY, 0);
    pivot.add(box(d.legW, LEG_H, d.legD, vmat(d.legColor), 0, -LEG_H / 2, 0));
    pivot.add(box(d.legW * 1.12, FOOT_H, d.legD * 1.5, vmat(footColor), 0, -LEG_H + FOOT_H / 2 - 0.02, d.legD * 0.22));
    group.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  return { head, body, leftArm, rightArm, leftLeg, rightLeg };
}

/**
 * Add a trailing robe/cape. Pivots at the shoulders (named `cloak`) so the
 * animator's lean/flutter swings the hem out behind the NPC while walking.
 */
export function addCloak(
  group: THREE.Group,
  torsoD: number,
  width: number,
  height: number,
  color: number,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = 'cloak';
  pivot.position.set(0, NPC_TORSO_TOP, -torsoD / 2 - 0.02);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.85, flatShading: true, side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 4), mat);
  plane.position.y = -height / 2;
  pivot.add(plane);
  group.add(pivot);
  return pivot;
}

/** Apply leather/skin PBR detail maps to the whole character (matches procedural NPCs). */
export function finishCharacter(group: THREE.Group): void {
  applyCharacterPBR(group);
}
