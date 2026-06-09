import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Sancho Barriga — the jolly, proverb-spouting peasant with an enormous belly
// (his namesake "barriga"). A coarse brown tunic, a rope belt slung under the
// gut, a round ruddy face, a flat country cap, and a leather wineskin (bota)
// hanging at his side.
const TUNIC = 0x7a5230;     // earthy brown wool
const SHIRT = 0xd8c8a8;     // cream undershirt
const ROPE = 0x9a7a44;
const SKIN = 0xd49a68;
const CHEEK = 0xd87a5a;
const HAIR = 0x3a2818;
const BOTA = 0x5a3a22;      // leather wineskin
const SHOE = 0x4a3320;

export class SanchoBarriga extends Mesh {
  static readonly type = 'npc_individual_sancho_barriga';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Sancho Barriga';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.74, torsoD: 0.52, torsoColor: TUNIC,
      headW: 0.54, headD: 0.52, skinColor: SKIN,
      armW: 0.23, armD: 0.25, armColor: TUNIC,
      legW: 0.24, legD: 0.28, legColor: 0x5a4028,
      footColor: SHOE,
      clothKind: 'wool',
    });

    // ── The great round belly (his defining feature) ──
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), vmat(TUNIC, { roughness: 0.85, kind: 'wool' }));
    belly.scale.set(1.05, 0.95, 0.95);
    belly.position.set(0, NPC_Y_TORSO - 0.14, 0.10);
    belly.castShadow = true;
    group.add(belly);
    // Cream shirt peeking at the collar.
    group.add(box(0.40, 0.16, 0.30, vmat(SHIRT, { roughness: 0.85, kind: 'wool' }), 0, NPC_Y_TORSO + 0.34, 0.06));

    // ── Rope belt slung UNDER the belly ──
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.04, 8, 16), vmat(ROPE, { roughness: 0.95 }));
    rope.rotation.x = Math.PI / 2;
    rope.scale.set(1.05, 0.95, 1);
    rope.position.set(0, NPC_Y_TORSO - 0.40, 0.06);
    group.add(rope);
    // Hanging rope knot.
    group.add(box(0.06, 0.18, 0.06, vmat(ROPE, { roughness: 0.95 }), 0.0, NPC_Y_TORSO - 0.52, 0.42));

    // ── Flat brown country cap (nods with the head) ──
    const capMat = vmat(0x5a3a22, { roughness: 0.85, kind: 'wool' });
    rig.head.add(box(0.56, 0.16, 0.54, capMat, 0, 0.24, -0.02));
    rig.head.add(box(0.40, 0.04, 0.18, capMat, 0, 0.18, 0.32));         // little peak

    // ── Round ruddy face: full beard, fat cheeks, twinkling eyes ──
    const beardMat = vmat(HAIR, { roughness: 0.92 });
    rig.head.add(box(0.48, 0.22, 0.14, beardMat, 0, -0.16, 0.20));      // jaw beard
    rig.head.add(box(0.30, 0.14, 0.12, beardMat, 0, -0.34, 0.18));      // rounded chin
    rig.head.add(box(0.34, 0.07, 0.06, beardMat, 0, 0.0, 0.245));       // moustache
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), vmat(CHEEK, { roughness: 0.8 }));
      c.scale.set(1, 0.8, 0.5);
      c.position.set(sx * 0.20, -0.04, 0.20);
      rig.head.add(c);
    }
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) rig.head.add(box(0.06, 0.04, 0.04, eye, sx * 0.12, 0.08, 0.245)); // squinty merry eyes

    // ── Leather wineskin (bota) hanging at the left hip ──
    const bota = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), vmat(BOTA, { roughness: 0.7 }));
    bota.scale.set(0.8, 1.3, 0.8);
    bota.position.set(-0.42, NPC_Y_TORSO - 0.34, 0.14);
    bota.castShadow = true;
    group.add(bota);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.1, 6), vmat(0x3a2818, { roughness: 0.6 }));
    spout.position.set(-0.42, NPC_Y_TORSO - 0.16, 0.14);
    group.add(spout);
    // Strap across the chest.
    const strap = box(0.5, 0.05, 0.02, vmat(BOTA, { roughness: 0.7 }), -0.1, NPC_Y_TORSO + 0.05, 0.24);
    strap.rotation.z = -0.7;
    group.add(strap);

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(SanchoBarriga);
