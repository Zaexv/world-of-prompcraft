import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Luisa la Patatera — the boisterous, potato-loving country farmwoman. A clean
// red headscarf knotted at the back, a long olive dress under a cream apron,
// braided hair, rosy cheeks, and a burlap potato sack hoisted on her shoulder.
const DRESS = 0x6e8a3a;     // olive-green country dress
const APRON = 0xe8e0cc;
const SCARF = 0xc02a2a;
const SCARF_DK = 0xa11f1f;
const SKIN = 0xd8a070;
const CHEEK = 0xdd8a6a;
const HAIR = 0x4a2f1a;
const SACK = 0xc2a878;      // burlap
const POTATO = 0xc0a056;
const SHOE = 0x4a3320;

export class LuisaPatatera extends Mesh {
  static readonly type = 'npc_individual_luisa_patatera';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Luisa la Patatera';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.60, torsoD: 0.40, torsoColor: DRESS,
      headW: 0.48, headD: 0.46, skinColor: SKIN,
      armW: 0.19, armD: 0.21, armColor: DRESS,
      legW: 0.20, legD: 0.24, legColor: DRESS,
      footColor: SHOE,
      clothKind: 'wool',
    });

    // ── Cream apron: bib + skirt panel + waist tie ──
    const apronMat = (): THREE.MeshStandardMaterial => vmat(APRON, { roughness: 0.9, kind: 'wool' });
    group.add(box(0.30, 0.30, 0.03, apronMat(), 0, NPC_Y_TORSO + 0.20, 0.205)); // bib
    group.add(box(0.44, 0.42, 0.03, apronMat(), 0, NPC_Y_TORSO - 0.16, 0.205)); // lower panel
    group.add(box(0.58, 0.07, 0.42, vmat(SCARF, { roughness: 0.7, kind: 'wool' }), 0, NPC_Y_TORSO - 0.02, 0)); // waist sash
    // Shoulder straps of the apron.
    for (const sx of [-1, 1]) {
      const strap = box(0.05, 0.34, 0.02, apronMat(), sx * 0.12, NPC_Y_TORSO + 0.30, 0.21);
      strap.rotation.z = sx * 0.06;
      group.add(strap);
    }

    // Long flared skirt hiding the legs (single clean cone).
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.50, 0.74, 10), vmat(DRESS, { roughness: 0.85, kind: 'wool' }));
    skirt.position.y = NPC_Y_TORSO - 0.62;
    skirt.castShadow = true;
    group.add(skirt);

    // ── Braided hair peeking out below the scarf, framing the face ──
    const hairMat = vmat(HAIR, { roughness: 0.9 });
    rig.head.add(box(0.50, 0.12, 0.10, hairMat, 0, 0.14, 0.20));        // fringe
    for (const sx of [-1, 1]) {
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.34, 6), hairMat);
      braid.position.set(sx * 0.26, -0.14, 0.06);
      rig.head.add(braid);
    }

    // ── Red headscarf: a smooth rounded cap + front band + back knot ──
    const scarfMat = vmat(SCARF, { roughness: 0.85, kind: 'wool' });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), scarfMat);
    cap.scale.set(1.04, 1.05, 1.04);
    cap.position.y = 0.10;
    cap.castShadow = true;
    rig.head.add(cap);
    // Front band trimming the scarf edge.
    rig.head.add(box(0.50, 0.07, 0.50, vmat(SCARF_DK, { roughness: 0.85, kind: 'wool' }), 0, 0.10, 0));
    // Knot + two short tails at the back.
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), scarfMat);
    knot.position.set(0, 0.12, -0.28);
    rig.head.add(knot);
    for (const sx of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), scarfMat);
      tail.position.set(sx * 0.06, 0.0, -0.3);
      tail.rotation.x = -0.5;
      rig.head.add(tail);
    }

    // ── Friendly face: rosy cheeks, simple eyes, small smile ──
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), vmat(CHEEK, { roughness: 0.8 }));
      c.scale.set(1, 0.7, 0.4);
      c.position.set(sx * 0.17, -0.08, 0.21);
      rig.head.add(c);
    }
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) rig.head.add(box(0.05, 0.06, 0.04, eye, sx * 0.11, 0.0, 0.235));
    rig.head.add(box(0.16, 0.03, 0.03, vmat(0x7a3a2a, { roughness: 0.6 }), 0, -0.14, 0.235)); // smile

    // ── Burlap potato sack resting on the right shoulder ──
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 7), vmat(SACK, { roughness: 0.95 }));
    sack.scale.set(0.9, 1.15, 0.9);
    sack.position.set(0.30, NPC_Y_TORSO + 0.34, -0.16);
    sack.castShadow = true;
    group.add(sack);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.12, 8), vmat(SACK, { roughness: 0.95 }));
    neck.position.set(0.26, NPC_Y_TORSO + 0.58, -0.10);
    group.add(neck);
    // Potatoes peeking from the top.
    const potatoMat = vmat(POTATO, { roughness: 0.85 });
    for (const [px, py, pz] of [[0.20, 0.64, -0.04], [0.32, 0.60, -0.10], [0.26, 0.68, -0.16]]) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), potatoMat);
      p.scale.set(1.2, 0.9, 1);
      p.position.set(px, NPC_Y_TORSO + py, pz);
      group.add(p);
    }
    // One arm raised to steady the sack.
    rig.rightArm.rotation.x = -0.5;

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(LuisaPatatera);
