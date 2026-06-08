/**
 * Shared low-poly character builder for hand-authored individual NPCs.
 *
 * Where _VoxelKit builds pure stacked cubes, this kit builds the same characters
 * with faceted, flat-shaded low-poly forms: an octagonal tapered torso and
 * tapered cylinder limbs with low radial-segment counts. Heads stay box-shaped
 * so face accessories (beards, eyes, glasses) still sit on a flat front.
 *
 * Same API shape as _VoxelKit (`buildLowPolyCharacter` returns the same named
 * rig: leftArm/rightArm/leftLeg/rightLeg pivots + body + head), so the limb
 * dimensions and accessory offsets carry over unchanged. addCloak / finishCharacter
 * / vmat / box are re-exported from _VoxelKit since they are style-agnostic.
 */
import * as THREE from 'three';
import {
  NPC_Y_LEG,
  NPC_Y_TORSO,
  NPC_Y_HEAD,
  NPC_TORSO_TOP,
} from '../../../entities/NPCAppearance';
import { vmat, box } from './_VoxelKit';
import type { VoxelDims, VoxelRig } from './_VoxelKit';

export { vmat, box, addCloak, finishCharacter } from './_VoxelKit';
export type { VoxelDims as LowPolyDims, VoxelRig as LowPolyRig, MatOpts } from './_VoxelKit';

const TORSO_H = 0.88;
const HEAD_H = 0.52;
const ARM_H = 0.66;
const LEG_H = 0.82;
const FACETS = 8; // radial segments — low enough to read as faceted low-poly

function taperedLimb(rTop: number, rBot: number, h: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, FACETS), mat);
  m.castShadow = true;
  return m;
}

/**
 * Build the animated low-poly body into `group` and return references to each
 * named part so the caller can hang accessories on them — identical contract to
 * buildVoxelCharacter.
 */
export function buildLowPolyCharacter(group: THREE.Group, d: VoxelDims): VoxelRig {
  const skinMat = vmat(d.skinColor, { roughness: 0.55 });
  const handColor = d.handColor ?? d.skinColor;
  const footColor = d.footColor ?? d.legColor;

  // ── Torso: octagonal tapered prism, flat facet facing +z ──
  const rX = d.torsoW / 2;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(rX * 0.9, rX * 1.02, TORSO_H, FACETS),
    vmat(d.torsoColor, { kind: d.clothKind }),
  );
  body.name = 'body';
  body.rotation.y = Math.PI / FACETS;            // centre a face on +z
  body.scale.z = (d.torsoD / d.torsoW) || 1;     // flatten front-to-back
  body.position.y = NPC_Y_TORSO;
  body.castShadow = true;
  group.add(body);

  // ── Head: faceted box (keeps a flat face for accessories) ──
  const head = box(d.headW, HEAD_H, d.headD, skinMat, 0, NPC_Y_HEAD, 0);
  head.name = 'head';
  group.add(head);

  // ── Arms (pivot at shoulder), tapered toward the wrist ──
  const shoulderY = NPC_TORSO_TOP;
  const armX = d.torsoW / 2 + d.armW / 2;
  const armR = d.armW / 2;
  const makeArm = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'leftArm' : 'rightArm';
    pivot.position.set(side * armX, shoulderY, 0);
    const arm = taperedLimb(armR, armR * 0.8, ARM_H, vmat(d.armColor, { kind: d.clothKind }));
    arm.position.y = -ARM_H / 2;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(armR * 1.15, 0), vmat(handColor, { roughness: 0.55 }));
    hand.position.y = -ARM_H - armR * 0.4;
    hand.castShadow = true;
    pivot.add(hand);
    group.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // ── Legs (pivot at hip), tapered toward the ankle ──
  const hipY = NPC_Y_LEG + LEG_H / 2;
  const legX = d.torsoW / 4;
  const legR = d.legW / 2;
  const makeLeg = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'leftLeg' : 'rightLeg';
    pivot.position.set(side * legX, hipY, 0);
    const leg = taperedLimb(legR, legR * 0.85, LEG_H, vmat(d.legColor, { kind: d.clothKind }));
    leg.position.y = -LEG_H / 2;
    pivot.add(leg);
    // Wedge foot: a 4-sided tapered prism tipped forward.
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(legR * 0.7, legR * 1.1, 0.2, 4), vmat(footColor));
    foot.rotation.y = Math.PI / 4;
    foot.position.set(0, -LEG_H - 0.04, d.legD * 0.18);
    foot.castShadow = true;
    pivot.add(foot);
    group.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  return { head, body, leftArm, rightArm, leftLeg, rightLeg };
}
