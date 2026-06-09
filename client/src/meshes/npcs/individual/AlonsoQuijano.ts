import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_TORSO_TOP, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Alonso Quijano — the gaunt, grave knight-errant (Don Quixote). Tall and thin,
// a dented makeshift breastplate over a faded doublet, a brass barber's-basin
// for a helm, a long pointed grey beard on a sombre face, a tattered cape, and
// a tall wooden lance planted at his side.
const DOUBLET = 0x6a5436;   // faded brown doublet
const ARMOR = 0x9aa0a6;     // dull, dented steel
const BRASS = 0xc0922f;     // barber's-basin helm
const SKIN = 0xd0a878;
const BEARD = 0xc8c2b6;     // grey
const CAPE = 0x7a3a3a;      // faded crimson cape
const WOOD = 0x6a4a2a;
const BOOT = 0x3a2c1d;

export class AlonsoQuijano extends Mesh {
  static readonly type = 'npc_individual_alonso_quijano';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Alonso Quijano';

    // Tall and lean: narrow torso + thin limbs, then scale the whole figure up.
    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.52, torsoD: 0.34, torsoColor: DOUBLET,
      headW: 0.44, headD: 0.44, skinColor: SKIN,
      armW: 0.16, armD: 0.18, armColor: DOUBLET,
      legW: 0.17, legD: 0.21, legColor: DOUBLET,
      footColor: BOOT,
      clothKind: 'wool',
    });

    const steel = (): THREE.MeshStandardMaterial => vmat(ARMOR, { roughness: 0.45, metalness: 0.6, kind: 'gold' });

    // ── Dented makeshift breastplate ──
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 8), steel());
    chest.rotation.y = Math.PI / 8;
    chest.scale.z = 0.6;
    chest.position.y = NPC_Y_TORSO + 0.12;
    chest.castShadow = true;
    group.add(chest);
    // A "dent" — a small dark inset.
    group.add(box(0.1, 0.08, 0.02, vmat(0x5a6066, { roughness: 0.6 }), -0.08, NPC_Y_TORSO + 0.14, 0.205));
    // Thin mismatched pauldron on one shoulder only.
    rig.rightArm.add(box(0.2, 0.12, 0.22, steel(), 0, 0.02, 0));
    group.add(box(0.36, 0.06, 0.26, steel(), 0, NPC_TORSO_TOP - 0.04, 0)); // gorget

    // ── Morion-style steel helm with brass comb (his "Mambrino's helmet") ──
    const brass = (): THREE.MeshStandardMaterial => vmat(BRASS, { roughness: 0.35, metalness: 0.75, kind: 'gold' });
    // Smooth steel dome hugging the top of the head.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), steel());
    dome.scale.set(1.02, 1.15, 1.05);
    dome.position.y = 0.18;
    dome.castShadow = true;
    rig.head.add(dome);
    // Narrow swept brim (a flattened torus), brass-trimmed.
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 8, 18), brass());
    brim.rotation.x = Math.PI / 2;
    brim.scale.set(1.0, 1.25, 0.5);   // front-and-back peaks, flattened
    brim.position.y = 0.17;
    rig.head.add(brim);
    // Brass comb ridge running front-to-back over the crown.
    const comb = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4), brass());
    comb.rotation.z = Math.PI / 2;
    comb.scale.set(1, 1, 0.5);
    comb.position.y = 0.40;
    rig.head.add(comb);
    // Small finial at the crown.
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), brass());
    finial.position.y = 0.46;
    rig.head.add(finial);

    // ── Long, sombre face: pointed grey beard, sunken eyes, sad brows ──
    const beardMat = vmat(BEARD, { roughness: 0.92 });
    rig.head.add(box(0.34, 0.22, 0.12, beardMat, 0, -0.16, 0.18));      // jaw
    rig.head.add(box(0.22, 0.18, 0.10, beardMat, 0, -0.34, 0.16));      // mid
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), beardMat);
    tip.rotation.x = Math.PI;
    tip.position.set(0, -0.52, 0.14);
    rig.head.add(tip);                                                  // long point
    // Drooping moustache.
    rig.head.add(box(0.28, 0.05, 0.06, beardMat, 0, -0.02, 0.21));
    const eye = vmat(0x2a2218, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.05, 0.04, 0.04, eye, sx * 0.1, 0.04, 0.215));
      const brow = box(0.11, 0.025, 0.03, beardMat, sx * 0.1, 0.11, 0.215);
      brow.rotation.z = sx * 0.25;       // sad, sloping brows
      rig.head.add(brow);
    }

    // ── Tall wooden lance planted in the right hand ──
    const lance = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.4, 7), vmat(WOOD, { roughness: 0.8 }));
    lance.add(shaft);
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), vmat(ARMOR, { roughness: 0.3, metalness: 0.8 }));
    point.position.y = 1.3;
    lance.add(point);
    // Small pennant just below the point.
    const pennant = box(0.18, 0.12, 0.01, vmat(CAPE, { roughness: 0.7, kind: 'wool' }), 0.1, 1.1, 0);
    lance.add(pennant);
    lance.position.set(0.34, NPC_Y_HEAD - 0.6, 0.16);
    lance.rotation.z = -0.04;
    group.add(lance);

    // ── Tattered faded-crimson cape ──
    addCloak(group, 0.34, 0.46, 1.1, CAPE, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    // Gaunt and unusually tall — overshoot the base scale a touch.
    group.scale.setScalar(ctx.scale * 1.12);
    return group;
  }
}

registerMesh(AlonsoQuijano);
