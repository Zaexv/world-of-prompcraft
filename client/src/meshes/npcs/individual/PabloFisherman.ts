import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Pablo the Fisherman — an easygoing village fisherman. A wide straw sun-hat,
// a striped rolled-sleeve tunic, canvas trousers, a long fishing rod with a
// line, and a wicker creel basket on his back.
const TUNIC = 0x5b86b0;     // faded sea-blue
const STRIPE = 0xe8e2d2;
const STRAW = 0xd9b65c;
const TROUSER = 0xb59a6a;
const SKIN = 0xc98f63;
const HAIR = 0x3a2a1a;
const WICKER = 0xb98a4a;
const ROD = 0x6a4a2a;

export class PabloFisherman extends Mesh {
  static readonly type = 'npc_individual_civilian_malaka_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Pablo the Fisherman';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.62, torsoD: 0.40, torsoColor: TUNIC,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.20, armD: 0.22, armColor: SKIN,    // rolled sleeves → bare forearms
      legW: 0.22, legD: 0.26, legColor: TROUSER,
      footColor: 0x4a3a2a,
      clothKind: 'wool',
    });

    // ── Striped tunic over the torso ──
    const stripeMat = (): THREE.MeshStandardMaterial => vmat(STRIPE, { roughness: 0.85, kind: 'wool' });
    for (const sy of [0.22, 0.0, -0.22]) {
      group.add(box(0.50, 0.06, 0.02, stripeMat(), 0, NPC_Y_TORSO + sy, 0.205));
    }
    // Short rolled sleeve cuffs at the shoulders.
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.24, 0.16, 0.26, vmat(TUNIC, { roughness: 0.85, kind: 'wool' }), 0, -0.08, 0));
    }
    // Rope belt.
    group.add(box(0.64, 0.05, 0.42, vmat(0x8a6a3a, { roughness: 0.9 }), 0, NPC_Y_TORSO - 0.30, 0));

    // ── Wide straw sun-hat (nods with the head) ──
    const strawMat = vmat(STRAW, { roughness: 0.9, kind: 'wool' });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.56, 0.05, 10), strawMat);
    brim.position.y = 0.26;
    rig.head.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.30, 0.22, 10), strawMat);
    crown.position.y = 0.38;
    rig.head.add(crown);
    rig.head.add(box(0.62, 0.05, 0.05, vmat(0x8a4a2a, { roughness: 0.8 }), 0, 0.30, 0.0)); // hat band

    // ── Stubbly face: short beard + hair + eyes ──
    const beardMat = vmat(HAIR, { roughness: 0.9 });
    rig.head.add(box(0.40, 0.14, 0.12, beardMat, 0, -0.18, 0.20));
    rig.head.add(box(0.30, 0.06, 0.06, beardMat, 0, -0.02, 0.235));
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) rig.head.add(box(0.05, 0.05, 0.04, eye, sx * 0.11, 0.05, 0.245));

    // ── Wicker creel basket on the back ──
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.28, 8), vmat(WICKER, { roughness: 0.9 }));
    basket.position.set(0, NPC_Y_TORSO + 0.0, -0.30);
    basket.castShadow = true;
    group.add(basket);
    group.add(box(0.05, 0.6, 0.03, vmat(0x6a4a2a, { roughness: 0.9 }), -0.22, NPC_Y_TORSO + 0.05, -0.05)); // strap

    // ── Long fishing rod resting on the right shoulder, line dangling ──
    const rod = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 1.7, 6), vmat(ROD, { roughness: 0.7 }));
    rod.add(pole);
    // Fishing line + float at the tip.
    const line = box(0.004, 0.5, 0.004, vmat(0xdddddd, { roughness: 0.5 }), 0, 0.85, 0.12);
    rod.add(line);
    const float = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), vmat(0xe04a3a, { roughness: 0.5 }));
    float.position.set(0, 0.6, 0.12);
    rod.add(float);
    rod.position.set(0.42, NPC_Y_HEAD - 0.4, 0.16);
    rod.rotation.z = -0.35;
    group.add(rod);

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(PabloFisherman);
