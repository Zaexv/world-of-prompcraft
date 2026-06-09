import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_TORSO_TOP } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Tundra Yeti — a massive, shaggy, fur-covered brute of the frozen north. Broad
// shoulders, long heavy arms, a pale-blue face buried in white fur, big lower
// fangs, and softly glowing ice-blue eyes. Built big and scaled up.
const FUR = 0xeef2f6;
const FUR_DK = 0xc6d2dc;
const FACE = 0x9fc0d4;
const EYE = 0xbfeaff;
const FANG = 0xeae4d4;
const CLAW = 0x8a96a0;

function fur(color: number): THREE.MeshStandardMaterial {
  return vmat(color, { roughness: 0.95 });
}

/** Sprinkle shaggy fur tufts (small cones) over a part. */
function shag(target: THREE.Object3D, count: number, spread: number, yBase: number, color: number): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = spread * (0.6 + (i % 3) * 0.18);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), fur(color));
    tuft.position.set(Math.cos(a) * r, yBase + (i % 2) * 0.12, Math.sin(a) * r * 0.8);
    tuft.rotation.x = Math.cos(a) * 0.4;
    tuft.rotation.z = Math.sin(a) * 0.4;
    tuft.castShadow = true;
    target.add(tuft);
  }
}

export class TundraYeti extends Mesh {
  static readonly type = 'npc_individual_yeti_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Tundra Yeti';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.9, torsoD: 0.6, torsoColor: FUR,
      headW: 0.56, headD: 0.52, skinColor: FACE,
      armW: 0.30, armD: 0.32, armColor: FUR,
      legW: 0.28, legD: 0.32, legColor: FUR,
      footColor: FUR_DK,
    });

    // Long, low-hanging arms (gorilla-like) — swing the pivots forward/out.
    rig.leftArm.rotation.z = 0.25;
    rig.rightArm.rotation.z = -0.25;

    // ── Shaggy fur over body + shoulders ──
    shag(group, 12, 0.5, NPC_Y_TORSO + 0.1, FUR);
    shag(group, 8, 0.42, NPC_Y_TORSO - 0.2, FUR_DK);
    // Heavy fur ruff around the neck/shoulders.
    const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.18, 8, 14), fur(FUR));
    ruff.rotation.x = Math.PI / 2;
    ruff.position.y = NPC_TORSO_TOP - 0.05;
    ruff.scale.set(1, 1, 0.8);
    group.add(ruff);
    // Fur tufts on the arms (swing with them).
    for (const arm of [rig.leftArm, rig.rightArm]) {
      shag(arm, 5, 0.22, -0.3, FUR);
      // Big clawed hand.
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), fur(FUR));
      hand.position.y = -0.7;
      arm.add(hand);
      for (let c = 0; c < 3; c++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), vmat(CLAW, { roughness: 0.5 }));
        claw.position.set(-0.1 + c * 0.1, -0.88, 0.16);
        claw.rotation.x = 0.4;
        arm.add(claw);
      }
    }

    // ── Face: pale-blue, sunk in fur, fangs, glowing eyes, heavy brow ──
    shag(rig.head, 8, 0.3, 0.16, FUR);            // fur crown
    const browMat = vmat(FUR_DK, { roughness: 0.95 });
    rig.head.add(box(0.5, 0.1, 0.1, browMat, 0, 0.12, 0.22));   // heavy brow
    const eyeMat = vmat(EYE, { roughness: 0.2, emissive: EYE, emissiveIntensity: 3.0 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), eyeMat);
      eye.position.set(sx * 0.13, 0.02, 0.24);
      rig.head.add(eye);
    }
    // Wide mouth with two upward fangs.
    rig.head.add(box(0.34, 0.1, 0.06, vmat(0x402028, { roughness: 0.6 }), 0, -0.16, 0.24));
    for (const sx of [-1, 1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), vmat(FANG, { roughness: 0.4 }));
      fang.position.set(sx * 0.1, -0.1, 0.26);
      rig.head.add(fang);
    }
    // Snub nose.
    rig.head.add(box(0.16, 0.1, 0.1, vmat(0x6f93a8, { roughness: 0.7 }), 0, -0.04, 0.27));

    finishCharacter(group);
    group.position.copy(ctx.position);
    // Towering brute — overshoot the manifest scale.
    group.scale.setScalar(ctx.scale * 1.15);
    return group;
  }
}

registerMesh(TundraYeti);
