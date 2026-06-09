import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Paco el Churrero — the gruff Andalusian master of fried breakfast. Chef's
// whites under a flour-dusted apron, a tall white toque, a red Andalusian
// neckerchief, a thick black moustache, and a frying paddle bearing a ring of
// golden churros.
const WHITE = 0xf2f0e8;
const APRON = 0xe6e2d6;
const RED = 0xc02a2a;
const DOUGH = 0xd9a441;     // fried golden churro
const SKIN = 0xc78a5c;
const MOUSTACHE = 0x2a1c12;
const SHOE = 0x3a2c1d;
const STEEL = 0xc8ced4;

export class PacoChurrero extends Mesh {
  static readonly type = 'npc_individual_churrero_malaka_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Paco el Churrero';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.68, torsoD: 0.44, torsoColor: WHITE,
      headW: 0.52, headD: 0.50, skinColor: SKIN,
      armW: 0.21, armD: 0.23, armColor: WHITE,
      legW: 0.23, legD: 0.27, legColor: 0x4a4a4a, // dark cook's trousers
      footColor: SHOE,
      clothKind: 'wool',
    });

    // ── Flour-dusted apron over the front ──
    group.add(box(0.50, 0.78, 0.04, vmat(APRON, { roughness: 0.92, kind: 'wool' }), 0, NPC_Y_TORSO - 0.06, 0.215));
    // Apron straps.
    for (const sx of [-1, 1]) {
      const s = box(0.06, 0.4, 0.02, vmat(APRON, { roughness: 0.9 }), sx * 0.16, NPC_Y_TORSO + 0.22, 0.22);
      s.rotation.z = sx * 0.12;
      group.add(s);
    }
    // Apron waist tie.
    group.add(box(0.56, 0.06, 0.42, vmat(RED, { roughness: 0.7, kind: 'wool' }), 0, NPC_Y_TORSO - 0.18, 0));
    // Flour smudges (light grey patches).
    const flour = vmat(0xf8f8f4, { roughness: 0.95 });
    group.add(box(0.12, 0.1, 0.01, flour, -0.12, NPC_Y_TORSO - 0.1, 0.236));
    group.add(box(0.09, 0.08, 0.01, flour, 0.14, NPC_Y_TORSO + 0.05, 0.236));

    // ── Red Andalusian neckerchief ──
    const kerchief = box(0.40, 0.12, 0.30, vmat(RED, { roughness: 0.7, kind: 'wool' }), 0, NPC_Y_TORSO + 0.40, 0);
    group.add(kerchief);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), vmat(RED, { roughness: 0.7, kind: 'wool' }));
    knot.position.set(0, NPC_Y_TORSO + 0.34, 0.20);
    group.add(knot);

    // ── Tall white toque (chef's hat, nods with the head) ──
    const toque = vmat(WHITE, { roughness: 0.85, kind: 'wool' });
    rig.head.add(box(0.50, 0.14, 0.48, toque, 0, 0.26, 0));           // band
    const puff = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.34, 10), toque);
    puff.position.y = 0.5;
    puff.castShadow = true;
    rig.head.add(puff);
    const puffTop = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toque);
    puffTop.scale.set(1, 0.6, 1);
    puffTop.position.y = 0.66;
    rig.head.add(puffTop);

    // ── Big black moustache + eyes + bushy brows ──
    const mMat = vmat(MOUSTACHE, { roughness: 0.9 });
    rig.head.add(box(0.34, 0.10, 0.07, mMat, 0, -0.02, 0.245));        // moustache bar
    rig.head.add(box(0.08, 0.06, 0.06, mMat, -0.18, 0.0, 0.235));      // curl tip L
    rig.head.add(box(0.08, 0.06, 0.06, mMat, 0.18, 0.0, 0.235));       // curl tip R
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.06, 0.05, 0.04, eye, sx * 0.12, 0.08, 0.245));
      rig.head.add(box(0.13, 0.03, 0.03, mMat, sx * 0.12, 0.15, 0.245)); // bushy brow
    }

    // ── Frying paddle with a ring of golden churros (in the right hand) ──
    const paddle = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 6), vmat(0x5a3d22, { roughness: 0.7 }));
    handle.rotation.z = Math.PI / 2;
    paddle.add(handle);
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), vmat(STEEL, { roughness: 0.35, metalness: 0.7 }));
    pan.position.x = 0.34;
    paddle.add(pan);
    // Churros laid across the pan.
    const churroMat = vmat(DOUGH, { roughness: 0.7 });
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const churro = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 5), churroMat);
      churro.position.set(0.34 + Math.cos(ang) * 0.06, 0.04, Math.sin(ang) * 0.06);
      churro.rotation.z = Math.PI / 2;
      churro.rotation.y = ang;
      paddle.add(churro);
    }
    paddle.position.set(0.34, NPC_Y_HEAD - 0.55, 0.28);
    group.add(paddle);

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(PacoChurrero);
