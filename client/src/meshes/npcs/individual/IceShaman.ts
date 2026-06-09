import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Ice Shaman — a humanoid frost mage who commands the spirits of the Crystal
// Tundra. A pale blue ceremonial robe with bone trim, an antlered bone
// headdress, a frosted beard, glowing ice eyes, and a totem staff crowned with
// a floating ice crystal.
const ROBE = 0x9fc8e0;
const ROBE_DK = 0x6f9ec0;
const BONE = 0xe8e2d0;
const ICE = 0x8fd8ff;
const SKIN = 0xbcd0dc;       // cold pallor
const BEARD = 0xeef4f8;
const BOOT = 0x4a5560;

function iceMat(i = 3.5): THREE.MeshStandardMaterial {
  return vmat(ICE, { roughness: 0.15, metalness: 0.1, emissive: ICE, emissiveIntensity: i });
}

export class IceShaman extends Mesh {
  static readonly type = 'npc_individual_ice_shaman_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Ice Shaman';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.60, torsoD: 0.40, torsoColor: ROBE,
      headW: 0.48, headD: 0.46, skinColor: SKIN,
      armW: 0.19, armD: 0.21, armColor: ROBE_DK,
      legW: 0.21, legD: 0.25, legColor: ROBE_DK,
      footColor: BOOT,
      clothKind: 'wool',
    });

    const boneMat = (): THREE.MeshStandardMaterial => vmat(BONE, { roughness: 0.7 });

    // ── Bone trim + frozen runes on the robe ──
    group.add(box(0.42, 0.08, 0.02, boneMat(), 0, NPC_Y_TORSO + 0.32, 0.205)); // collar
    group.add(box(0.07, 0.66, 0.02, boneMat(), 0, NPC_Y_TORSO, 0.205));        // centre band
    group.add(box(0.64, 0.08, 0.44, boneMat(), 0, NPC_Y_TORSO - 0.30, 0));     // belt
    for (const [rx, ry] of [[-0.15, 0.16], [0.15, -0.04], [0, -0.2]]) {
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), iceMat(2.8));
      rune.position.set(rx, NPC_Y_TORSO + ry, 0.215);
      group.add(rune);
    }
    // Lower robe flare.
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.46, 0.7, 8), vmat(ROBE, { roughness: 0.85, kind: 'wool' }));
    skirt.position.y = NPC_Y_TORSO - 0.62;
    skirt.castShadow = true;
    group.add(skirt);
    // Bone pauldrons.
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.26, 0.12, 0.28, boneMat(), 0, 0.0, 0));
    }

    // ── Antlered bone headdress (nods with the head) ──
    rig.head.add(box(0.5, 0.14, 0.48, boneMat(), 0, 0.22, 0)); // crown band
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const antler = new THREE.Mesh(new THREE.ConeGeometry(0.04 - i * 0.008, 0.22, 4), boneMat());
        antler.position.set(sx * (0.18 + i * 0.06), 0.36 + i * 0.06, -0.05 - i * 0.05);
        antler.rotation.z = sx * (0.5 + i * 0.2);
        rig.head.add(antler);
      }
    }
    // Ice gem on the brow.
    const brow = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), iceMat(4.0));
    brow.position.set(0, 0.22, 0.26);
    rig.head.add(brow);

    // ── Frosted beard + glowing eyes ──
    const beardMat = vmat(BEARD, { roughness: 0.92 });
    rig.head.add(box(0.42, 0.26, 0.13, beardMat, 0, -0.18, 0.19));
    rig.head.add(box(0.28, 0.2, 0.11, beardMat, 0, -0.4, 0.17));
    rig.head.add(box(0.30, 0.06, 0.06, beardMat, 0, -0.02, 0.235)); // moustache
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), iceMat(4.0));
      eye.position.set(sx * 0.11, 0.08, 0.245);
      rig.head.add(eye);
    }

    // ── Totem staff with a floating ice crystal (right hand) ──
    const staff = new THREE.Group();
    staff.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.7, 6), vmat(0x5a4a3a, { roughness: 0.8 })));
    // Carved totem head near the top.
    staff.add(box(0.14, 0.16, 0.14, boneMat(), 0, 0.7, 0));
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), iceMat(4.5));
    crystal.position.y = 0.95;
    staff.add(crystal);
    // Orbiting shards.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), iceMat(3.5));
      shard.position.set(Math.cos(a) * 0.16, 0.95, Math.sin(a) * 0.16);
      staff.add(shard);
    }
    staff.position.set(0.5, NPC_Y_HEAD - 0.62, 0.16);
    group.add(staff);

    addCloak(group, 0.40, 0.5, 0.95, ROBE_DK, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(IceShaman);
