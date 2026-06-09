import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// The Bog Witch — an ancient, twisted hag of the Moin Swamps. A tattered dark-
// green robe, a tall crooked witch's hat, sickly green skin with a long hooked
// nose and a wart, stringy grey hair, and a gnarled staff topped with a
// glowing swamp-green orb.
const ROBE = 0x2e3a28;
const ROBE_DK = 0x1c241a;
const HAT = 0x14180f;
const SKIN = 0x8fa46a;       // sickly green
const HAIR = 0x9a968c;       // stringy grey
const GLOW = 0x9aff66;
const WART = 0x6a7a44;

function glowMat(i = 3.5): THREE.MeshStandardMaterial {
  return vmat(GLOW, { roughness: 0.3, emissive: GLOW, emissiveIntensity: i });
}

export class BogWitch extends Mesh {
  static readonly type = 'npc_individual_marsh_witch_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'The Bog Witch';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.58, torsoD: 0.38, torsoColor: ROBE,
      headW: 0.48, headD: 0.46, skinColor: SKIN,
      armW: 0.17, armD: 0.19, armColor: ROBE,
      legW: 0.19, legD: 0.23, legColor: ROBE_DK,
      footColor: 0x2a2018,
      clothKind: 'wool',
    });

    // Hunched forward — tilt the whole upper body.
    rig.body.rotation.x = 0.22;
    rig.head.position.z += 0.14;
    rig.head.position.y -= 0.1;
    rig.head.rotation.x = 0.18;

    // ── Tattered robe: ragged hem + rope sash ──
    group.add(box(0.62, 0.06, 0.42, vmat(0x4a3a24, { roughness: 0.9 }), 0, NPC_Y_TORSO - 0.26, 0));
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 0.74, 8), vmat(ROBE, { roughness: 0.88, kind: 'wool' }));
    skirt.position.y = NPC_Y_TORSO - 0.62;
    skirt.castShadow = true;
    group.add(skirt);
    // Ragged hem points.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rag = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 4), vmat(ROBE_DK, { roughness: 0.9 }));
      rag.rotation.x = Math.PI;
      rag.position.set(Math.cos(a) * 0.46, NPC_Y_TORSO - 0.96, Math.sin(a) * 0.42);
      group.add(rag);
    }

    // ── Tall crooked witch's hat (nods with the head) ──
    const hatMat = vmat(HAT, { roughness: 0.85, kind: 'wool' });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.05, 12), hatMat);
    brim.position.y = 0.26;
    rig.head.add(brim);
    const segs = 6;
    let hy = 0.34; let lean = 0;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const w = 0.34 - t * 0.30;
      lean += 0.04 + t * 0.03; // crooks over to one side
      const seg = box(w, 0.13, w, hatMat, lean, hy, 0);
      rig.head.add(seg);
      hy += 0.11;
    }
    // Bent tip.
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), hatMat);
    tip.position.set(lean + 0.04, hy, 0);
    tip.rotation.z = -0.8;
    rig.head.add(tip);
    // Glowing band on the brim.
    rig.head.add(box(0.4, 0.04, 0.04, glowMat(2.4), 0, 0.30, 0.2));

    // ── Stringy grey hair hanging from under the hat ──
    const hairMat = vmat(HAIR, { roughness: 0.95 });
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 0.4, 4), hairMat);
        lock.position.set(sx * (0.18 + i * 0.06), -0.14, 0.08 - i * 0.06);
        rig.head.add(lock);
      }
    }

    // ── Hag face: long hooked nose, wart, glowing eyes, snaggle grin ──
    // Hooked nose: base sunk into the face (z≈0.13) so it emerges from the head
    // and hooks forward-and-down to a tip around z≈0.38 — long, but attached.
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 5), vmat(SKIN, { roughness: 0.7 }));
    nose.rotation.x = 1.85;
    nose.position.set(0, -0.03, 0.26);
    rig.head.add(nose);
    const wart = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), vmat(WART, { roughness: 0.9 }));
    wart.position.set(0.05, -0.06, 0.33); // seated on the side of the hook
    rig.head.add(wart);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), glowMat(3.5));
      eye.position.set(sx * 0.12, 0.08, 0.235);
      rig.head.add(eye);
    }
    rig.head.add(box(0.16, 0.03, 0.03, vmat(0x3a2818, { roughness: 0.6 }), 0, -0.16, 0.235)); // thin grin

    // ── Gnarled staff with a glowing orb (right hand) ──
    const staff = new THREE.Group();
    // Crooked shaft from stacked, offset segments.
    let sy = -0.2;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 5), vmat(0x4a3a24, { roughness: 0.85 }));
      seg.position.set(Math.sin(i) * 0.04, sy, 0);
      seg.rotation.z = Math.sin(i) * 0.12;
      staff.add(seg);
      sy += 0.28;
    }
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), glowMat(4.5));
    orb.position.y = sy;
    staff.add(orb);
    staff.position.set(0.48, NPC_Y_HEAD - 0.7, 0.18);
    group.add(staff);

    addCloak(group, 0.38, 0.46, 0.95, ROBE_DK, 'wool');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(BogWitch);
