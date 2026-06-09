import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_TORSO_TOP } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Captain Rolan — the captain of the Fort Malaka guard. Polished steel plate,
// a crimson officer's cape, gold trim, a tall red-plumed helm, and a longsword
// sheathed at the hip. He reads as the highest-ranking soldier in the fort.
const STEEL = 0xb6c0c9;
const STEEL_DK = 0x8a949d;
const CAPE = 0xb02a2a;
const GOLD = 0xe6c23a;
const SKIN = 0xc99a72;
const BEARD = 0x4a3320;
const BOOT = 0x3a2c1d;

export class CaptainRolan extends Mesh {
  static readonly type = 'npc_individual_guard_malaka_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Captain Rolan';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.66, torsoD: 0.42, torsoColor: STEEL,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.21, armD: 0.23, armColor: STEEL_DK,
      legW: 0.23, legD: 0.27, legColor: STEEL_DK,
      footColor: BOOT,
    });

    const steel = (): THREE.MeshStandardMaterial =>
      vmat(STEEL, { roughness: 0.32, metalness: 0.85, kind: 'gold' });
    const goldFn = (): THREE.MeshStandardMaterial =>
      vmat(GOLD, { roughness: 0.4, metalness: 0.7, kind: 'gold' });

    // ── Sculpted breastplate over the torso ──
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.30, 0.5, 8), steel());
    chest.rotation.y = Math.PI / 8;
    chest.scale.z = 0.62;
    chest.position.y = NPC_Y_TORSO + 0.12;
    chest.castShadow = true;
    group.add(chest);
    // Gold gorget + central rank stripe.
    group.add(box(0.34, 0.07, 0.30, goldFn(), 0, NPC_TORSO_TOP - 0.04, 0));
    group.add(box(0.07, 0.46, 0.02, goldFn(), 0, NPC_Y_TORSO + 0.06, 0.225));
    // Gold belt.
    group.add(box(0.68, 0.10, 0.46, goldFn(), 0, NPC_Y_TORSO - 0.34, 0));

    // ── Layered steel pauldrons + bracers (swing with the arms) ──
    for (const arm of [rig.leftArm, rig.rightArm]) {
      const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), steel());
      pauldron.scale.set(1.1, 0.7, 1.1);
      pauldron.position.y = 0.03;
      pauldron.castShadow = true;
      arm.add(pauldron);
      arm.add(box(0.24, 0.20, 0.26, steel(), 0, -0.58, 0)); // bracer
    }
    // Knee guards.
    for (const leg of [rig.leftLeg, rig.rightLeg]) {
      leg.add(box(0.27, 0.12, 0.29, steel(), 0, -0.40, 0.02));
    }

    // ── Tall plumed helm (nods with the head) ──
    const helm = (): THREE.MeshStandardMaterial =>
      vmat(STEEL, { roughness: 0.3, metalness: 0.88, kind: 'gold' });
    rig.head.add(box(0.54, 0.30, 0.52, helm(), 0, 0.18, 0));            // dome band
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8), helm());
    dome.scale.set(1, 0.7, 1);
    dome.position.y = 0.32;
    rig.head.add(dome);
    rig.head.add(box(0.30, 0.06, 0.04, goldFn(), 0, 0.34, 0.26));        // brow ridge
    // Nasal guard down the face.
    rig.head.add(box(0.06, 0.30, 0.05, helm(), 0, 0.08, 0.25));
    // Crimson plume — a stack of cones cresting the helm.
    const plumeMat = vmat(CAPE, { roughness: 0.7, kind: 'wool' });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.09 - i * 0.012, 0.18, 5), plumeMat);
      c.position.set(0, 0.50 + i * 0.12, -0.02 - i * 0.03);
      c.rotation.x = -0.25;
      c.castShadow = true;
      rig.head.add(c);
    }

    // ── Stern face: short beard + eyes ──
    const beardMat = vmat(BEARD, { roughness: 0.9 });
    rig.head.add(box(0.40, 0.18, 0.13, beardMat, 0, -0.16, 0.20));
    rig.head.add(box(0.30, 0.07, 0.06, beardMat, 0, 0.0, 0.235));
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) rig.head.add(box(0.06, 0.06, 0.04, eye, sx * 0.11, 0.06, 0.245));

    // ── Longsword sheathed at the left hip ──
    const sheath = new THREE.Group();
    sheath.add(box(0.07, 0.7, 0.05, vmat(BOOT, { roughness: 0.7 }), 0, 0, 0));
    sheath.add(box(0.10, 0.10, 0.07, goldFn(), 0, 0.34, 0));            // hilt guard
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), vmat(0x2e1c10));
    grip.position.y = 0.46;
    sheath.add(grip);
    sheath.position.set(-0.4, NPC_Y_TORSO - 0.2, 0.05);
    sheath.rotation.z = 0.25;
    group.add(sheath);

    // ── Officer's crimson cape ──
    addCloak(group, 0.42, 0.56, 1.05, CAPE, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(CaptainRolan);
