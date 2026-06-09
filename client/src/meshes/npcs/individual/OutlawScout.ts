import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Outlaw Scout — a wilderness bandit lurking in the Malaka wilds. A deep green
// hood shadowing the face, layered brown leather armour, forearm bracers, a
// dagger at the ready, and a short bow + quiver slung on the back.
const LEATHER = 0x4a3826;
const LEATHER_DK = 0x33271a;
const HOOD = 0x2f4029;
const SKIN = 0xc59a6f;
const STEEL = 0xc8ced4;
const WOOD = 0x6a4a2a;
const BOOT = 0x2e2418;

export class OutlawScout extends Mesh {
  static readonly type = 'npc_individual_bandit_02';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Outlaw Scout';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.60, torsoD: 0.38, torsoColor: LEATHER,
      headW: 0.48, headD: 0.46, skinColor: SKIN,
      armW: 0.19, armD: 0.21, armColor: LEATHER_DK,
      legW: 0.21, legD: 0.25, legColor: LEATHER_DK,
      footColor: BOOT,
    });

    const leather = (): THREE.MeshStandardMaterial => vmat(LEATHER, { roughness: 0.7 });

    // ── Layered leather chest + cross strap + belt ──
    group.add(box(0.5, 0.4, 0.42, leather(), 0, NPC_Y_TORSO + 0.05, 0));
    const strap = box(0.55, 0.09, 0.02, vmat(LEATHER_DK, { roughness: 0.7 }), 0, NPC_Y_TORSO + 0.05, 0.21);
    strap.rotation.z = 0.7;
    group.add(strap);
    group.add(box(0.62, 0.08, 0.42, vmat(LEATHER_DK, { roughness: 0.7 }), 0, NPC_Y_TORSO - 0.30, 0));
    // Bracers.
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.23, 0.18, 0.25, leather(), 0, -0.56, 0));
    }

    // ── Green hood pulled over the head, face in shadow ──
    const hoodMat = vmat(HOOD, { roughness: 0.85, kind: 'wool' });
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 8), hoodMat);
    hood.position.y = 0.22;
    hood.castShadow = true;
    rig.head.add(hood);
    rig.head.add(box(0.52, 0.40, 0.48, hoodMat, 0, 0.06, -0.04)); // hood back/sides
    rig.head.add(box(0.42, 0.36, 0.18, vmat(0x0a0c08, { roughness: 0.6 }), 0, 0.0, 0.18)); // shadowed face
    // Two glints of eyes.
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), vmat(0xc8e0a0, { emissive: 0xaaff66, emissiveIntensity: 1.6 }));
      eye.position.set(sx * 0.1, 0.04, 0.255);
      rig.head.add(eye);
    }
    // Shoulder cape over the hood.
    addCloak(group, 0.38, 0.44, 0.6, HOOD, 'wool');

    // ── Dagger in the right hand ──
    const dagger = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), vmat(STEEL, { roughness: 0.2, metalness: 0.85 }));
    blade.scale.z = 0.4;
    blade.position.y = 0.15;
    dagger.add(blade);
    dagger.add(box(0.1, 0.03, 0.04, vmat(0x3a2515, { roughness: 0.7 }), 0, 0, 0));
    dagger.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), vmat(0x2e1c10)));
    dagger.position.set(0, -0.78, 0.1);
    dagger.rotation.x = -0.3;
    rig.rightArm.add(dagger);

    // ── Short bow + quiver on the back ──
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 12, Math.PI * 1.2), vmat(WOOD, { roughness: 0.7 }));
    bow.position.set(-0.1, NPC_Y_TORSO + 0.05, -0.26);
    bow.rotation.y = Math.PI / 2;
    group.add(bow);
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.4, 8), leather());
    quiver.position.set(0.16, NPC_Y_TORSO + 0.1, -0.26);
    quiver.rotation.x = 0.3;
    group.add(quiver);
    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 4), vmat(0xb8b0a0));
      arrow.position.set(0.13 + i * 0.03, NPC_Y_TORSO + 0.32, -0.24);
      group.add(arrow);
    }

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(OutlawScout);
