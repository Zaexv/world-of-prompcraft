import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Flame Cultist — a zealot of the fire god Ignathar guarding the Blasted
// Suarezlands. A deep crimson-and-charcoal hooded robe with glowing ember
// runes, a shadowed hood with burning eyes, and a charred staff topped with a
// living flame orb.
const ROBE = 0x6a1818;
const ROBE_DK = 0x2a0e0e;
const FIRE = 0xff5a1e;
const SKIN = 0xb87a52;
const CHAR = 0x1a1210;

function emberMat(i = 3.2): THREE.MeshStandardMaterial {
  return vmat(FIRE, { roughness: 0.4, emissive: FIRE, emissiveIntensity: i });
}

export class FlameCultist extends Mesh {
  static readonly type = 'npc_individual_ignathar_acolyte_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Flame Cultist';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.62, torsoD: 0.40, torsoColor: ROBE,
      headW: 0.48, headD: 0.46, skinColor: SKIN,
      armW: 0.20, armD: 0.22, armColor: ROBE_DK,
      legW: 0.22, legD: 0.26, legColor: ROBE_DK,
      footColor: CHAR,
      clothKind: 'wool',
    });

    // ── Glowing ember runes down the robe + sash ──
    group.add(box(0.07, 0.74, 0.02, emberMat(2.6), 0, NPC_Y_TORSO, 0.205));
    for (const [rx, ry] of [[-0.16, 0.2], [0.15, 0.0], [-0.13, -0.18], [0.14, -0.32]]) {
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), emberMat(3.4));
      rune.position.set(rx, NPC_Y_TORSO + ry, 0.215);
      group.add(rune);
    }
    group.add(box(0.66, 0.08, 0.44, vmat(CHAR, { roughness: 0.7 }), 0, NPC_Y_TORSO - 0.30, 0));
    // Lower robe flare.
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.46, 0.7, 8), vmat(ROBE, { roughness: 0.85, kind: 'wool' }));
    skirt.position.y = NPC_Y_TORSO - 0.62;
    skirt.castShadow = true;
    group.add(skirt);

    // ── Deep hood, shadowed face, burning eyes ──
    const hoodMat = vmat(ROBE_DK, { roughness: 0.85, kind: 'wool' });
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.64, 8), hoodMat);
    hood.position.y = 0.24;
    hood.castShadow = true;
    rig.head.add(hood);
    rig.head.add(box(0.52, 0.42, 0.48, hoodMat, 0, 0.06, -0.04));
    rig.head.add(box(0.42, 0.38, 0.18, vmat(0x080404, { roughness: 0.6 }), 0, 0.0, 0.18));
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), emberMat(4.5));
      eye.position.set(sx * 0.1, 0.04, 0.255);
      rig.head.add(eye);
    }

    // ── Charred staff with a living flame orb (right hand) ──
    const staff = new THREE.Group();
    staff.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.6, 6), vmat(CHAR, { roughness: 0.8 })));
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), emberMat(4.5));
    orb.position.y = 0.85;
    staff.add(orb);
    // Flame tongues around the orb.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), emberMat(4.0));
      flame.position.set(Math.cos(a) * 0.12, 0.95, Math.sin(a) * 0.12);
      staff.add(flame);
    }
    staff.position.set(0.5, NPC_Y_HEAD - 0.6, 0.16);
    group.add(staff);

    addCloak(group, 0.40, 0.5, 0.95, ROBE_DK, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(FlameCultist);
