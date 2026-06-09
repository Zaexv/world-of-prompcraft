import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Sister Constanza — the healer of Fort Malaka. A serene nun in a cream habit
// and deep-blue mantle, a white wimple framing her face, a golden holy cross at
// the chest, and a tall healing staff topped with a softly glowing emerald gem.
const HABIT = 0xe7e2d4;     // cream wool habit
const MANTLE = 0x33508f;    // deep blue mantle / veil
const WIMPLE = 0xf2f0ea;    // white cloth
const GOLD = 0xe6c23a;
const SKIN = 0xddb48c;
const GEM = 0x4fe6b0;       // healing emerald
const SHOE = 0x4a3a2a;

export class SisterConstanza extends Mesh {
  static readonly type = 'npc_individual_healer_malaka_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Sister Constanza';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.60, torsoD: 0.40, torsoColor: HABIT,
      headW: 0.48, headD: 0.46, skinColor: SKIN,
      armW: 0.19, armD: 0.21, armColor: HABIT,
      legW: 0.21, legD: 0.25, legColor: HABIT,
      footColor: SHOE,
      clothKind: 'wool',
    });

    const mantleMat = (): THREE.MeshStandardMaterial => vmat(MANTLE, { roughness: 0.8, kind: 'wool' });
    const goldFn = (): THREE.MeshStandardMaterial => vmat(GOLD, { roughness: 0.4, metalness: 0.7, kind: 'gold' });

    // ── Blue mantle over the shoulders, open at the front ──
    group.add(box(0.30, 0.66, 0.05, mantleMat(), -0.18, NPC_Y_TORSO + 0.04, 0.205)); // left front panel
    group.add(box(0.30, 0.66, 0.05, mantleMat(), 0.18, NPC_Y_TORSO + 0.04, 0.205));  // right front panel
    group.add(box(0.66, 0.72, 0.05, mantleMat(), 0, NPC_Y_TORSO + 0.06, -0.205));    // back
    // Rope cincture at the waist.
    group.add(box(0.62, 0.06, 0.42, vmat(0xb8a472, { roughness: 0.9 }), 0, NPC_Y_TORSO - 0.28, 0));

    // ── Golden holy cross at the chest ──
    group.add(box(0.06, 0.22, 0.03, goldFn(), 0, NPC_Y_TORSO + 0.08, 0.235));
    group.add(box(0.16, 0.06, 0.03, goldFn(), 0, NPC_Y_TORSO + 0.12, 0.235));

    // Long skirt flare hiding the legs.
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.46, 0.7, 8), vmat(HABIT, { roughness: 0.85, kind: 'wool' }));
    skirt.position.y = NPC_Y_TORSO - 0.62;
    skirt.castShadow = true;
    group.add(skirt);

    // ── White wimple + blue veil framing the face (nods with the head) ──
    const wimpleMat = vmat(WIMPLE, { roughness: 0.85, kind: 'wool' });
    // Wimple band around the face.
    rig.head.add(box(0.56, 0.58, 0.10, wimpleMat, 0, 0.04, -0.20));     // back of head
    rig.head.add(box(0.12, 0.50, 0.40, wimpleMat, -0.24, 0.0, 0.04));   // left cheek frame
    rig.head.add(box(0.12, 0.50, 0.40, wimpleMat, 0.24, 0.0, 0.04));    // right cheek frame
    rig.head.add(box(0.50, 0.14, 0.40, wimpleMat, 0, 0.26, 0.02));      // forehead band
    // Blue veil draping over the top and back.
    const veil = vmat(MANTLE, { roughness: 0.85, kind: 'wool' });
    rig.head.add(box(0.58, 0.16, 0.56, veil, 0, 0.34, -0.02));
    const veilTail = box(0.50, 0.5, 0.10, veil, 0, 0.06, -0.26);
    rig.head.add(veilTail);
    // Gentle eyes.
    const eye = vmat(0x3a4a6a, { roughness: 0.3 });
    for (const sx of [-1, 1]) rig.head.add(box(0.05, 0.05, 0.04, eye, sx * 0.1, 0.04, 0.235));

    // ── Healing staff with a glowing emerald (in the right hand) ──
    const staff = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.5, 7), vmat(0x6a4a2a, { roughness: 0.7 }));
    staff.add(pole);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 14), goldFn());
    ring.position.y = 0.78;
    staff.add(ring);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09, 0),
      vmat(GEM, { roughness: 0.1, metalness: 0.2, emissive: GEM, emissiveIntensity: 3.5 }),
    );
    gem.position.y = 0.78;
    staff.add(gem);
    staff.position.set(0.46, NPC_Y_HEAD - 0.55, 0.16);
    group.add(staff);

    // Trailing veil-cloak in blue.
    addCloak(group, 0.40, 0.5, 0.95, MANTLE, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(SisterConstanza);
