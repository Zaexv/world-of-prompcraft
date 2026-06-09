import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Gate Warden — the immovable gatekeeper of Fort Malaka. Heavy dark-iron plate,
// a closed great-helm with a narrow vision slit, a planted halberd, and a big
// rectangular tower shield strapped to one arm. Built broad and tank-like.
const IRON = 0x6a7077;
const IRON_DK = 0x4a4f55;
const TRIM = 0x9aa2aa;
const WOOD = 0x5a3d22;
const STEEL = 0xc8ced4;
const SKIN = 0xb98a62;
const BOOT = 0x2e2418;

export class GateWarden extends Mesh {
  static readonly type = 'npc_individual_guard_malaka_02';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Gate Warden';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.74, torsoD: 0.48, torsoColor: IRON,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.24, armD: 0.26, armColor: IRON_DK,
      legW: 0.26, legD: 0.30, legColor: IRON_DK,
      footColor: BOOT,
    });

    const iron = (): THREE.MeshStandardMaterial =>
      vmat(IRON, { roughness: 0.45, metalness: 0.7, kind: 'gold' });
    const ironDk = (): THREE.MeshStandardMaterial =>
      vmat(IRON_DK, { roughness: 0.5, metalness: 0.6, kind: 'gold' });
    const trimFn = (): THREE.MeshStandardMaterial =>
      vmat(TRIM, { roughness: 0.4, metalness: 0.8, kind: 'gold' });

    // ── Bulky riveted cuirass ──
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.40, 0.56, 8), iron());
    chest.rotation.y = Math.PI / 8;
    chest.scale.z = 0.66;
    chest.position.y = NPC_Y_TORSO + 0.08;
    chest.castShadow = true;
    group.add(chest);
    // Rivets across the chest.
    for (const sx of [-1, 0, 1]) {
      for (const sy of [0.22, 0.0, -0.22]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), trimFn());
        rivet.position.set(sx * 0.18, NPC_Y_TORSO + 0.1 + sy, 0.26);
        group.add(rivet);
      }
    }
    group.add(box(0.78, 0.12, 0.52, ironDk(), 0, NPC_Y_TORSO - 0.36, 0)); // heavy belt

    // ── Huge boxy pauldrons ──
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.30, 0.22, 0.32, iron(), 0, 0.02, 0));
      arm.add(box(0.27, 0.22, 0.29, ironDk(), 0, -0.56, 0)); // gauntlet
    }
    for (const leg of [rig.leftLeg, rig.rightLeg]) {
      leg.add(box(0.30, 0.14, 0.32, iron(), 0, -0.40, 0.02)); // greave
    }

    // ── Closed great-helm with a vision slit (nods with the head) ──
    rig.head.add(box(0.56, 0.56, 0.54, iron(), 0, 0.06, 0));           // helm shell
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.22, 6), iron());
    top.position.y = 0.42;
    rig.head.add(top);
    // Dark vision slit.
    rig.head.add(box(0.40, 0.05, 0.04, vmat(0x101214, { roughness: 0.4 }), 0, 0.1, 0.27));
    // Riveted reinforcement bar down the face (set just behind the slit to avoid z-fighting).
    rig.head.add(box(0.06, 0.46, 0.04, trimFn(), 0, 0.0, 0.26));

    // ── Tower shield strapped to the left arm ──
    const shield = new THREE.Group();
    shield.add(box(0.5, 0.9, 0.06, iron(), 0, 0, 0));
    shield.add(box(0.44, 0.84, 0.02, ironDk(), 0, 0, 0.04));            // inset
    const boss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), trimFn());
    boss.scale.set(1, 1, 0.5);
    boss.position.z = 0.06;
    shield.add(boss);
    shield.position.set(-0.5, NPC_Y_TORSO - 0.05, 0.12);
    group.add(shield);

    // ── Planted halberd in the right hand ──
    const halberd = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 7), vmat(WOOD, { roughness: 0.8 }));
    halberd.add(shaft);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 4), vmat(STEEL, { roughness: 0.2, metalness: 0.85 }));
    blade.scale.z = 0.3;
    blade.position.y = 1.0;
    halberd.add(blade);
    const axe = box(0.26, 0.22, 0.03, vmat(STEEL, { roughness: 0.2, metalness: 0.85 }), 0.16, 0.74, 0);
    halberd.add(axe);
    halberd.position.set(0.52, NPC_Y_HEAD - 0.5, 0.18);
    group.add(halberd);

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(GateWarden);
