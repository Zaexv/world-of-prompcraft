import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_TORSO_TOP } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Guardia Abelardo — the stiff, by-the-book royal guard who reveres King Paco.
// A navy dress uniform with crimson facings, gold buttons and braid, a white
// cross-sash, a black bicorn hat, a sheathed saber, and an upturned waxed
// moustache. He stands rigidly at attention.
const NAVY = 0x1c2742;
const NAVY_DK = 0x141c30;
const RED = 0xa01f25;
const GOLD = 0xe6c23a;
const WHITE = 0xeeeae0;
const SKIN = 0xc78a5c;
const MOUSTACHE = 0x2a1c12;
const BOOT = 0x1a140e;

export class GuardiaAbelardo extends Mesh {
  static readonly type = 'npc_individual_guardia_abelardo';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Guardia Abelardo';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.62, torsoD: 0.40, torsoColor: NAVY,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.20, armD: 0.22, armColor: NAVY,
      legW: 0.22, legD: 0.26, legColor: NAVY_DK,
      footColor: BOOT,
      clothKind: 'wool',
    });

    const goldFn = (): THREE.MeshStandardMaterial => vmat(GOLD, { roughness: 0.4, metalness: 0.7, kind: 'gold' });

    // ── Crimson facings down the coat front + collar ──
    group.add(box(0.16, 0.72, 0.03, vmat(RED, { roughness: 0.7, kind: 'wool' }), 0, NPC_Y_TORSO + 0.02, 0.205));
    group.add(box(0.54, 0.10, 0.42, vmat(RED, { roughness: 0.7, kind: 'wool' }), 0, NPC_TORSO_TOP - 0.05, 0)); // stand collar
    // Twin rows of gold buttons.
    for (const sx of [-0.08, 0.08]) {
      for (const sy of [0.26, 0.13, 0.0, -0.13, -0.26]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), goldFn());
        b.position.set(sx, NPC_Y_TORSO + sy, 0.225);
        group.add(b);
      }
    }
    // Gold waist belt + buckle.
    group.add(box(0.64, 0.08, 0.42, vmat(0x1a140e, { roughness: 0.6 }), 0, NPC_Y_TORSO - 0.32, 0));
    group.add(box(0.1, 0.1, 0.03, goldFn(), 0, NPC_Y_TORSO - 0.32, 0.215));

    // ── White cross-sash over the right shoulder ──
    const sash = box(0.62, 0.10, 0.02, vmat(WHITE, { roughness: 0.85, kind: 'wool' }), 0, NPC_Y_TORSO + 0.06, 0.215);
    sash.rotation.z = 0.7;
    group.add(sash);
    // Gold epaulettes (swing with the arms).
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.26, 0.08, 0.28, goldFn(), 0, 0.02, 0));
      // Fringe tassels.
      for (let i = 0; i < 3; i++) {
        arm.add(box(0.03, 0.1, 0.03, goldFn(), -0.08 + i * 0.08, -0.06, 0.12));
      }
      arm.add(box(0.22, 0.12, 0.24, vmat(RED, { roughness: 0.7, kind: 'wool' }), 0, -0.56, 0)); // red cuff
    }

    // ── Black bicorn hat with gold cockade (nods with the head) ──
    const bicorn = vmat(NAVY_DK, { roughness: 0.7, kind: 'wool' });
    // Two upturned points fore-and-aft.
    const front = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), bicorn);
    front.rotation.x = Math.PI / 2;
    front.rotation.z = Math.PI / 4;
    front.scale.set(0.5, 1, 1);
    front.position.set(0, 0.34, 0.0);
    rig.head.add(front);
    rig.head.add(box(0.52, 0.12, 0.30, bicorn, 0, 0.26, 0));            // crown band
    // Gold cockade on the front.
    const cockade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8), goldFn());
    cockade.rotation.x = Math.PI / 2;
    cockade.position.set(0, 0.30, 0.24);
    rig.head.add(cockade);

    // ── Upturned waxed moustache + eyes ──
    const mMat = vmat(MOUSTACHE, { roughness: 0.9 });
    rig.head.add(box(0.30, 0.06, 0.06, mMat, 0, -0.02, 0.245));
    const tipL = box(0.06, 0.10, 0.05, mMat, -0.18, 0.02, 0.235); tipL.rotation.z = 0.6; rig.head.add(tipL);
    const tipR = box(0.06, 0.10, 0.05, mMat, 0.18, 0.02, 0.235); tipR.rotation.z = -0.6; rig.head.add(tipR);
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.05, 0.05, 0.04, eye, sx * 0.11, 0.08, 0.245));
      rig.head.add(box(0.12, 0.025, 0.03, mMat, sx * 0.11, 0.15, 0.245)); // stern brow
    }

    // ── Sheathed saber at the left hip ──
    const saber = new THREE.Group();
    const scab = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.8, 6), vmat(0x1a140e, { roughness: 0.5, metalness: 0.3 }));
    saber.add(scab);
    const hilt = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 10), goldFn());
    hilt.position.y = 0.42;
    saber.add(hilt);
    saber.position.set(-0.38, NPC_Y_TORSO - 0.2, 0.06);
    saber.rotation.z = 0.3;
    group.add(saber);

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(GuardiaAbelardo);
