import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO } from '../../../entities/NPCAppearance';
import { buildVoxelCharacter, addCloak, finishCharacter, box, vmat } from './_VoxelKit';

// Reference: docs/assets/characters/nireg.png — reimagined as a desert sage.
// Green-and-gold robe with bright-gold pauldrons, trim and bands, a heavy brown
// beard, and a wrapped cream desert turban crowned with an emerald jewel.
const ROBE = 0x3a8c3f;
const GOLD = 0xe8c020;
const SKIN = 0xc79a5f;       // sun-weathered desert tan
const BEARD = 0x6b4a2e;
const TURBAN = 0xe8dcc0;     // sand-cream cloth
const TURBAN_SHADE = 0xd6c39c;
const GEM = 0x1f8a4c;        // emerald, echoing the robe
const BOOT = 0x4a3018;

export class NiregJenkinsVoxel extends Mesh {
  static readonly type = 'npc_individual_nireg_jenkins_voxel';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Nireg Jenkins';

    const rig = buildVoxelCharacter(group, {
      torsoW: 0.62, torsoD: 0.40, torsoColor: ROBE,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.20, armD: 0.22, armColor: ROBE,
      legW: 0.22, legD: 0.26, legColor: ROBE,
      footColor: BOOT,
    });

    const gold = vmat(GOLD, { roughness: 0.45, metalness: 0.35 });
    const goldFn = (): THREE.MeshStandardMaterial => vmat(GOLD, { roughness: 0.45, metalness: 0.35 });

    // ── Robe trim (gold) ──
    // Vertical centre band + V-collar on the chest.
    group.add(box(0.09, 0.72, 0.02, goldFn(), 0, NPC_Y_TORSO, 0.205));
    group.add(box(0.40, 0.09, 0.02, goldFn(), 0, NPC_Y_TORSO + 0.32, 0.205));
    // Side bands.
    for (const sx of [-1, 1]) {
      group.add(box(0.05, 0.72, 0.02, goldFn(), sx * 0.24, NPC_Y_TORSO, 0.205));
    }
    // Gold belt.
    group.add(box(0.66, 0.10, 0.44, gold, 0, NPC_Y_TORSO - 0.30, 0));

    // ── Gold pauldrons + cuffs (swing with the arms) ──
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.27, 0.15, 0.31, goldFn(), 0, -0.02, 0));
      arm.add(box(0.23, 0.10, 0.25, goldFn(), 0, -0.60, 0));
    }
    // Gold leg bands (front).
    for (const leg of [rig.leftLeg, rig.rightLeg]) {
      leg.add(box(0.06, 0.55, 0.02, goldFn(), 0, -0.42, 0.14));
    }

    // ── Head: wrapped desert turban (nods with the head) ──
    const clothMat = vmat(TURBAN, { roughness: 0.85 });
    const clothShade = vmat(TURBAN_SHADE, { roughness: 0.85 });
    // Stacked, slightly-rotated wrap rings give the layered cloth look.
    const wraps: Array<{ r: number; y: number; tilt: number; mat: THREE.MeshStandardMaterial }> = [
      { r: 0.30, y: 0.20, tilt: 0.06, mat: clothMat },
      { r: 0.31, y: 0.29, tilt: -0.05, mat: clothShade },
      { r: 0.28, y: 0.37, tilt: 0.04, mat: clothMat },
    ];
    for (const w of wraps) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(w.r, 0.085, 8, 18), w.mat);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = w.tilt;
      ring.position.y = w.y;
      rig.head.add(ring);
    }
    // Domed crown closing the top of the wrap.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), clothMat);
    dome.scale.set(1, 0.7, 1);
    dome.position.y = 0.40;
    rig.head.add(dome);
    // Cloth tail hanging down one side.
    const tail = box(0.14, 0.46, 0.07, clothShade, 0.24, -0.02, -0.06);
    tail.rotation.z = 0.12;
    rig.head.add(tail);
    // Front band + emerald jewel.
    rig.head.add(box(0.30, 0.07, 0.06, vmat(GOLD, { roughness: 0.45, metalness: 0.35 }), 0, 0.22, 0.255));
    const jewel = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.055, 0),
      vmat(GEM, { roughness: 0.15, metalness: 0.2, emissive: GEM, emissiveIntensity: 0.4 }),
    );
    jewel.position.set(0, 0.30, 0.26);
    rig.head.add(jewel);

    const beardMat = vmat(BEARD, { roughness: 0.9 });
    rig.head.add(box(0.42, 0.30, 0.14, beardMat, 0, -0.16, 0.20));     // jaw
    rig.head.add(box(0.30, 0.22, 0.12, beardMat, 0, -0.40, 0.18));     // mid
    rig.head.add(box(0.16, 0.16, 0.10, beardMat, 0, -0.58, 0.16));     // point
    rig.head.add(box(0.30, 0.07, 0.06, beardMat, 0, 0.02, 0.235));     // moustache

    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.06, 0.06, 0.04, eye, sx * 0.11, 0.10, 0.245));
    }

    // Trailing robe.
    addCloak(group, 0.40, 0.52, 0.98, ROBE);

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(NiregJenkinsVoxel);
