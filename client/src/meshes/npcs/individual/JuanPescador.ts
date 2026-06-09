import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Juan el Pescador — the nostalgic poet-fisherman of the Fort Malaka beach.
// Older and weathered: a heavy teal oilskin coat, a flat fisherman's cap, a
// long grey beard, and a knotted fishing net slung over one shoulder. He gazes
// out at the Mediterranean, lost in melancholy.
const COAT = 0x2f5d5a;      // weathered teal oilskin
const COAT_DK = 0x234846;
const CAP = 0x3a3a44;
const BEARD = 0xb8b4ac;     // grey
const SKIN = 0xbd8a5e;
const NET = 0xcfc6a8;
const BOOT = 0x3a2c1d;

export class JuanPescador extends Mesh {
  static readonly type = 'npc_individual_juan_pescador';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Juan el Pescador';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.64, torsoD: 0.42, torsoColor: COAT,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.21, armD: 0.23, armColor: COAT,
      legW: 0.22, legD: 0.26, legColor: COAT_DK,
      footColor: BOOT,
      clothKind: 'wool',
    });

    // ── Open oilskin coat: lapels + long skirt ──
    const coatMat = (): THREE.MeshStandardMaterial => vmat(COAT, { roughness: 0.7, kind: 'wool' });
    const lapel = (sx: number): THREE.Mesh => {
      const m = box(0.16, 0.6, 0.05, coatMat(), sx * 0.17, NPC_Y_TORSO + 0.04, 0.205);
      m.rotation.z = sx * -0.1;
      return m;
    };
    group.add(lapel(-1), lapel(1));
    // Long coat tails to the shins.
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.40, 0.7, 8), vmat(COAT_DK, { roughness: 0.72, kind: 'wool' }));
    tail.position.y = NPC_Y_TORSO - 0.6;
    tail.castShadow = true;
    group.add(tail);
    // Worn leather belt.
    group.add(box(0.66, 0.07, 0.44, vmat(0x4a3320, { roughness: 0.85 }), 0, NPC_Y_TORSO - 0.30, 0));
    // Tarnished buttons.
    for (const sy of [0.2, 0.05, -0.1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), vmat(0xb8843a, { roughness: 0.4, metalness: 0.6 }));
      b.position.set(0.08, NPC_Y_TORSO + sy, 0.225);
      group.add(b);
    }

    // ── Flat fisherman's cap (nods with the head) ──
    const capMat = vmat(CAP, { roughness: 0.85, kind: 'wool' });
    rig.head.add(box(0.52, 0.14, 0.50, capMat, 0, 0.24, -0.02));        // crown
    rig.head.add(box(0.40, 0.04, 0.20, capMat, 0, 0.18, 0.32));         // short peak

    // ── Long grey beard, weathered face ──
    const beardMat = vmat(BEARD, { roughness: 0.92 });
    rig.head.add(box(0.44, 0.24, 0.14, beardMat, 0, -0.16, 0.19));
    rig.head.add(box(0.34, 0.22, 0.13, beardMat, 0, -0.36, 0.17));
    rig.head.add(box(0.22, 0.18, 0.11, beardMat, 0, -0.54, 0.15));
    rig.head.add(box(0.32, 0.07, 0.06, beardMat, 0, 0.0, 0.235));       // moustache
    const eye = vmat(0x2a3a3a, { roughness: 0.3 });
    for (const sx of [-1, 1]) rig.head.add(box(0.05, 0.05, 0.04, eye, sx * 0.11, 0.08, 0.245));

    // ── Knotted fishing net slung across the chest and over the shoulder ──
    const netMat = vmat(NET, { roughness: 0.9, transparent: true, opacity: 0.92 });
    // A draped net panel — a flat mesh of crossed cords approximated with a thin
    // box plus knot beads on a grid.
    const netPanel = box(0.34, 0.5, 0.02, netMat, -0.2, NPC_Y_TORSO + 0.0, 0.21);
    netPanel.rotation.z = 0.5;
    group.add(netPanel);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 5), netMat);
        knot.position.set(-0.30 + j * 0.08 + i * 0.03, NPC_Y_TORSO + 0.22 - i * 0.14, 0.225);
        group.add(knot);
      }
    }

    // Long trailing coat-back like a cloak.
    addCloak(group, 0.42, 0.5, 1.0, COAT_DK, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(JuanPescador);
