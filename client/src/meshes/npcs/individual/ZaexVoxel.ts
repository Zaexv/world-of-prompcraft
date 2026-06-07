import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO } from '../../../entities/NPCAppearance';
import { buildVoxelCharacter, finishCharacter, box, vmat } from './_VoxelKit';

// Reference: docs/assets/characters/zaex.png
// Broad-shouldered warrior elf: pink skin, tall purple mohawk, pointed ears,
// glowing white eyes, crossed crimson straps over a bare chest, brown leather
// pauldrons/bracers, a crimson skirt and heavy brown boots.
const SKIN = 0xc98a8a;
const HAIR = 0x7a4b9e;
const STRAP = 0xa83252;
const LEATHER = 0x6e3b3b;
const SKIRT = 0xb03a5e;
const BOOT = 0x4a2a1e;

export class ZaexVoxel extends Mesh {
  static readonly type = 'npc_individual_zaex_01_voxel';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Zaex';

    const rig = buildVoxelCharacter(group, {
      torsoW: 0.78, torsoD: 0.46, torsoColor: SKIN,
      headW: 0.52, headD: 0.50, skinColor: SKIN,
      armW: 0.24, armD: 0.26, armColor: SKIN,
      legW: 0.26, legD: 0.30, legColor: SKIN,
      footColor: BOOT,
    });

    const strapMat = vmat(STRAP, { roughness: 0.6 });
    const leatherMat = (): THREE.MeshStandardMaterial => vmat(LEATHER, { roughness: 0.7 });

    // ── Crossed straps over chest (and back) ──
    for (const z of [0.235, -0.235]) {
      for (const dir of [1, -1]) {
        const s = box(0.62, 0.09, 0.02, strapMat, 0, NPC_Y_TORSO + 0.04, z);
        s.rotation.z = dir * 0.72;
        group.add(s);
      }
    }
    // Buckle / gem where the straps cross.
    group.add(box(0.1, 0.1, 0.04, vmat(STRAP, { roughness: 0.3, metalness: 0.3 }), 0, NPC_Y_TORSO + 0.04, 0.245));

    // ── Pauldrons + bracers (swing with arms) ──
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.30, 0.18, 0.34, leatherMat(), 0, 0.0, 0));      // shoulder
      arm.add(box(0.27, 0.22, 0.29, leatherMat(), 0, -0.52, 0));    // forearm bracer
    }

    // ── Crimson skirt + belt over the hips ──
    group.add(box(0.84, 0.40, 0.52, vmat(SKIRT, { roughness: 0.75, kind: 'wool' }), 0, NPC_Y_TORSO - 0.58, 0));
    group.add(box(0.82, 0.12, 0.50, leatherMat(), 0, NPC_Y_TORSO - 0.36, 0));

    // ── Heavy boots (cover the lower legs, swing with them) ──
    for (const leg of [rig.leftLeg, rig.rightLeg]) {
      leg.add(box(0.32, 0.42, 0.36, vmat(BOOT, { roughness: 0.6, metalness: 0.1 }), 0, -0.62, 0.03));
    }

    // ── Head: mohawk, side hair, ears, glowing eyes ──
    const hairMat = vmat(HAIR, { roughness: 0.8 });
    // Mohawk: a crest of purple blocks down the centre, tallest in the middle.
    for (let i = 0; i < 5; i++) {
      const h = 0.18 + Math.sin((i / 4) * Math.PI) * 0.18;
      rig.head.add(box(0.1, h, 0.12, hairMat, 0, 0.26 + h / 2 - 0.02, -0.16 + i * 0.08));
    }
    // Shaved sides + back hair.
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.05, 0.46, 0.5, hairMat, sx * 0.26, 0.0, -0.02));
    }
    rig.head.add(box(0.5, 0.46, 0.06, hairMat, 0, 0.0, -0.26));

    // Pointed elf ears.
    const earMat = vmat(SKIN, { roughness: 0.55 });
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), earMat);
      ear.position.set(sx * 0.29, 0.08, 0.0);
      ear.rotation.z = sx * -0.85;
      rig.head.add(ear);
    }

    // Glowing white eyes (with a faint outer glow box).
    const eyeMat = vmat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1.8 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.1, 0.06, 0.04, eyeMat, sx * 0.12, 0.02, 0.255));
    }

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(ZaexVoxel);
