import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_TORSO_TOP } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Wandering Knight — a weathered, errant warrior of the Sunlit Meadows. Worn
// steel plate, a closed sallet helm with a vision slit, a faded blue tabard
// with a simple sigil, a sheathed longsword, and a tall kite shield. Humbler
// and more travel-worn than a fort captain — no plume, no cape.
const STEEL = 0xacb4bc;
const STEEL_DK = 0x848c94;
const TABARD = 0x3f5a86;     // faded blue
const TABARD_TRIM = 0xd8d2bc;
const SKIN = 0xc9a079;
const BOOT = 0x3a2c1d;

export class WanderingKnight extends Mesh {
  static readonly type = 'npc_individual_wandering_knight_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Wandering Knight';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.64, torsoD: 0.42, torsoColor: STEEL,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.21, armD: 0.23, armColor: STEEL_DK,
      legW: 0.23, legD: 0.27, legColor: STEEL_DK,
      footColor: BOOT,
    });

    const steel = (): THREE.MeshStandardMaterial => vmat(STEEL, { roughness: 0.4, metalness: 0.75, kind: 'gold' });

    // ── Worn breastplate ──
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.30, 0.48, 8), steel());
    chest.rotation.y = Math.PI / 8;
    chest.scale.z = 0.62;
    chest.position.y = NPC_Y_TORSO + 0.12;
    chest.castShadow = true;
    group.add(chest);

    // ── Faded blue tabard over the chest with a simple sigil ──
    const tabardMat = vmat(TABARD, { roughness: 0.8, kind: 'wool' });
    group.add(box(0.34, 0.78, 0.04, tabardMat, 0, NPC_Y_TORSO - 0.05, 0.215));
    group.add(box(0.36, 0.07, 0.04, vmat(TABARD_TRIM, { roughness: 0.8 }), 0, NPC_Y_TORSO + 0.30, 0.22)); // hem trim
    // Diamond sigil.
    const sigil = box(0.14, 0.14, 0.02, vmat(TABARD_TRIM, { roughness: 0.7 }), 0, NPC_Y_TORSO + 0.06, 0.236);
    sigil.rotation.z = Math.PI / 4;
    group.add(sigil);
    group.add(box(0.66, 0.08, 0.44, vmat(BOOT, { roughness: 0.6 }), 0, NPC_Y_TORSO - 0.34, 0)); // belt

    // ── Pauldrons + bracers + knee guards ──
    for (const arm of [rig.leftArm, rig.rightArm]) {
      const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), steel());
      pauldron.scale.set(1.1, 0.7, 1.1);
      pauldron.position.y = 0.02;
      arm.add(pauldron);
      arm.add(box(0.23, 0.18, 0.25, steel(), 0, -0.56, 0));
    }
    for (const leg of [rig.leftLeg, rig.rightLeg]) {
      leg.add(box(0.26, 0.12, 0.28, steel(), 0, -0.4, 0.02));
    }
    group.add(box(0.34, 0.06, 0.30, steel(), 0, NPC_TORSO_TOP - 0.04, 0)); // gorget

    // ── Closed sallet helm with a vision slit (nods with the head) ──
    rig.head.add(box(0.54, 0.5, 0.52, steel(), 0, 0.06, 0));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 6), steel());
    tail.rotation.x = -1.9;
    tail.position.set(0, 0.14, -0.28);  // swept tail at the back of the sallet
    rig.head.add(tail);
    rig.head.add(box(0.42, 0.05, 0.04, vmat(0x101214, { roughness: 0.4 }), 0, 0.12, 0.27)); // slit
    rig.head.add(box(0.5, 0.08, 0.06, steel(), 0, 0.27, 0.05)); // ridge

    // ── Sheathed longsword at the left hip ──
    const sword = new THREE.Group();
    sword.add(box(0.06, 0.8, 0.05, vmat(BOOT, { roughness: 0.7 }), 0, 0, 0));
    sword.add(box(0.18, 0.05, 0.06, steel(), 0, 0.4, 0));      // crossguard
    sword.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), vmat(0x2e1c10)));
    sword.children[2].position.y = 0.5;
    sword.position.set(-0.4, NPC_Y_TORSO - 0.2, 0.04);
    sword.rotation.z = 0.28;
    group.add(sword);

    // ── Tall kite shield on the right arm ──
    const shield = new THREE.Group();
    shield.add(box(0.46, 0.5, 0.06, steel(), 0, 0.1, 0));
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.4, 4), steel());
    point.rotation.x = Math.PI;
    point.position.y = -0.28;
    point.scale.z = 0.12;
    shield.add(point);
    // Tabard-blue face + sigil.
    shield.add(box(0.36, 0.4, 0.02, tabardMat, 0, 0.1, 0.05));
    const ss = box(0.12, 0.12, 0.02, vmat(TABARD_TRIM, { roughness: 0.7 }), 0, 0.12, 0.07);
    ss.rotation.z = Math.PI / 4;
    shield.add(ss);
    shield.position.set(0.52, NPC_Y_TORSO - 0.02, 0.1);
    group.add(shield);

    // A short, travel-worn half-cape on one shoulder.
    addCloak(group, 0.42, 0.4, 0.55, TABARD, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(WanderingKnight);
