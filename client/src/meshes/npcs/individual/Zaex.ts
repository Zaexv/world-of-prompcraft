import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_TORSO_TOP } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';

// Reference: docs/assets/characters/zaex.png
// A lean, powerful ranger-elf: voluminous swept-back purple hair, long pointed
// ears, glowing honey eyes, a fitted mauve cuirass under a crossed strap harness
// with a central clasp, rounded leather pauldrons, forearm bracers, a flared
// crimson layered kilt, tall brown greaves — and a dagger in each hand.
const SKIN = 0xcd9090;
const ARMOR = 0xbf7a82;      // fitted mauve cuirass
const HAIR_DARK = 0x5a3676;
const HAIR_LIGHT = 0x8a5bb0;
const STRAP = 0x7a3340;
const LEATHER = 0x6b4326;
const SKIRT = 0xb83a5e;
const SKIRT_DARK = 0x8f2a47;
const BOOT = 0x4a2e1a;
const BRONZE = 0xb8843a;
const STEEL = 0xd8dde2;
const VEST = 0x4a2730;       // dark wine-leather chaleco
const BEARD_COL = 0x4a2f63;  // dark-purple beard, matching the hair

/** A low-poly dagger (blade + crossguard + grip), tip pointing down −Y in a ready grip. */
function makeDagger(): THREE.Group {
  const d = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.13, 6), vmat(0x2e1c10, { roughness: 0.7 }));
  grip.position.y = 0.06;
  d.add(grip);
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), vmat(BRONZE, { roughness: 0.3, metalness: 0.6 }));
  pommel.position.y = 0.14;
  d.add(pommel);
  const guard = box(0.13, 0.03, 0.04, vmat(BRONZE, { roughness: 0.3, metalness: 0.6 }), 0, 0.0, 0);
  d.add(guard);
  // Blade: a flattened 4-sided cone tapering to a point below the guard.
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 4), vmat(STEEL, { roughness: 0.18, metalness: 0.85 }));
  blade.rotation.x = Math.PI;          // point downward
  blade.scale.z = 0.4;                 // flatten into a blade
  blade.position.y = -0.18;
  d.add(blade);
  return d;
}

export class Zaex extends Mesh {
  static readonly type = 'npc_individual_zaex_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Zaex';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.66, torsoD: 0.42, torsoColor: ARMOR,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.20, armD: 0.22, armColor: SKIN,
      legW: 0.22, legD: 0.26, legColor: SKIN,
      footColor: BOOT,
    });

    const leather = (): THREE.MeshStandardMaterial => vmat(LEATHER, { roughness: 0.7 });
    const strapMat = (): THREE.MeshStandardMaterial => vmat(STRAP, { roughness: 0.6 });

    // ── Broad-shouldered chest plate (V-taper over the kit torso) ──
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.30, 0.42, 8), vmat(ARMOR, { roughness: 0.55, kind: 'velvet' }));
    chest.rotation.y = Math.PI / 8;
    chest.scale.z = 0.62;
    chest.position.y = NPC_Y_TORSO + 0.16;
    chest.castShadow = true;
    group.add(chest);
    // Collar.
    group.add(box(0.34, 0.07, 0.30, leather(), 0, NPC_TORSO_TOP - 0.04, 0));

    // ── Sleeveless chaleco (vest): open front lapels, sides and back ──
    const vestMat = (): THREE.MeshStandardMaterial => vmat(VEST, { roughness: 0.7 });
    const lapel = (sx: number): THREE.Mesh => {
      const m = box(0.17, 0.62, 0.05, vestMat(), sx * 0.17, NPC_Y_TORSO + 0.04, 0.205);
      m.rotation.z = sx * -0.08;
      return m;
    };
    group.add(lapel(-1), lapel(1));
    group.add(box(0.05, 0.62, 0.40, vestMat(), -0.33, NPC_Y_TORSO + 0.04, 0)); // left side
    group.add(box(0.05, 0.62, 0.40, vestMat(), 0.33, NPC_Y_TORSO + 0.04, 0));  // right side
    group.add(box(0.52, 0.64, 0.05, vestMat(), 0, NPC_Y_TORSO + 0.04, -0.205)); // back

    // ── Crossed strap harness, front and back, with a central clasp ──
    for (const z of [0.215, -0.215]) {
      for (const dir of [1, -1]) {
        const s = box(0.58, 0.085, 0.02, strapMat(), 0, NPC_Y_TORSO + 0.06, z);
        s.rotation.z = dir * 0.7;
        group.add(s);
      }
    }
    const clasp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8), vmat(BRONZE, { roughness: 0.3, metalness: 0.6 }));
    clasp.rotation.x = Math.PI / 2;
    clasp.position.set(0, NPC_Y_TORSO + 0.06, 0.22);
    group.add(clasp);

    // ── Rounded leather pauldrons + forearm bracers (swing with the arms) ──
    for (const arm of [rig.leftArm, rig.rightArm]) {
      const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), leather());
      pauldron.scale.set(1, 0.8, 1);
      pauldron.position.y = 0.02;
      pauldron.castShadow = true;
      arm.add(pauldron);
      const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.2, 8), leather());
      bracer.position.y = -0.5;
      arm.add(bracer);
    }

    // ── Belt + long layered crimson kilt that fully hides the legs ──
    group.add(box(0.7, 0.1, 0.46, leather(), 0, NPC_Y_TORSO - 0.40, 0));
    const skirtMat = vmat(SKIRT, { roughness: 0.7, kind: 'wool' });
    const skirtDarkMat = vmat(SKIRT_DARK, { roughness: 0.7, kind: 'wool' });
    // Ten overlapping panels hang nearly to the ankles, draped vertically so the
    // legs stay covered while walking.
    const panelCount = 10;
    for (let i = 0; i < panelCount; i++) {
      const ang = (i / panelCount) * Math.PI * 2;
      const front = Math.cos(ang); // 1 at front, -1 at back
      const len = 0.80 + Math.max(0, front) * 0.10;
      const panel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, len, 4), i % 2 === 0 ? skirtMat : skirtDarkMat);
      const r = 0.30;
      panel.position.set(Math.sin(ang) * r, NPC_Y_TORSO - 0.40 - len / 2 + 0.04, Math.cos(ang) * r * 0.7);
      panel.rotation.y = ang;
      panel.rotation.z = Math.sin(ang) * 0.12; // mostly vertical drape
      panel.rotation.x = -Math.cos(ang) * 0.1;
      panel.castShadow = true;
      group.add(panel);
    }

    // ── Tall greaves over the lower legs ──
    for (const leg of [rig.leftLeg, rig.rightLeg]) {
      const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.135, 0.46, 8), vmat(BOOT, { roughness: 0.55, metalness: 0.1 }));
      greave.position.y = -0.58;
      greave.castShadow = true;
      leg.add(greave);
      leg.add(box(0.26, 0.07, 0.28, leather(), 0, -0.36, 0)); // knee cuff
    }

    // ── Head: a tall purple "cresta" (mohawk crest), shaved sides ──
    const hairDark = vmat(HAIR_DARK, { roughness: 0.8 });
    const hairLight = vmat(HAIR_LIGHT, { roughness: 0.8 });
    // Thin base ridge along the midline holding the crest together.
    rig.head.add(box(0.07, 0.12, 0.56, hairDark, 0, 0.30, -0.02));
    // Arched row of spikes, tallest in the centre, leaning slightly back.
    const crestN = 7;
    for (let i = 0; i < crestN; i++) {
      const t = i / (crestN - 1);            // 0 front → 1 back
      const h = 0.20 + Math.sin(t * Math.PI) * 0.26;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.065, h, 4), i % 2 === 0 ? hairLight : hairDark);
      spike.position.set(0, 0.30 + h / 2 - 0.02, 0.22 - t * 0.50);
      spike.rotation.x = -0.18;
      spike.castShadow = true;
      rig.head.add(spike);
    }

    // ── Dark-purple beard hugging the jaw, tapering to a point below the chin ──
    // Every piece sits in front of the head's front face (z ≈ 0.24) to avoid
    // coplanar z-fighting, and the lower masses hang below the chin (head bottom
    // at y ≈ -0.26), so nothing clips through the head.
    const beardMat = vmat(BEARD_COL, { roughness: 0.85 });
    rig.head.add(box(0.40, 0.16, 0.14, beardMat, 0, -0.12, 0.19));  // upper jaw
    rig.head.add(box(0.34, 0.16, 0.14, beardMat, 0, -0.26, 0.18));  // chin (straddles head bottom)
    rig.head.add(box(0.22, 0.16, 0.12, beardMat, 0, -0.40, 0.16));  // lower
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 4), beardMat);
    tip.rotation.x = Math.PI;
    tip.rotation.y = Math.PI / 4;
    tip.position.set(0, -0.52, 0.14);
    rig.head.add(tip);
    // Short sideburns on the lower-front cheeks (kept inside the head width and
    // in front of the face so they don't clip through the head's side faces).
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.09, 0.20, 0.13, beardMat, sx * 0.18, -0.10, 0.19));
    }

    // Long pointed elf ears, angled up and back.
    const earMat = vmat(SKIN, { roughness: 0.55 });
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 4), earMat);
      ear.position.set(sx * 0.27, 0.06, -0.04);
      ear.rotation.z = sx * -0.7;
      ear.rotation.x = -0.4;
      rig.head.add(ear);
    }

    // Glowing honey-coloured eyes. The emissive is driven well past the
    // renderer's UnrealBloom threshold (0.9), so the engine's bloom pass produces
    // the glow.
    const eyeMat = vmat(0xffcf73, { emissive: 0xffb733, emissiveIntensity: 4.5 });
    const browMat = vmat(0x6e4a4a, { roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.062, 0), eyeMat);
      eye.position.set(sx * 0.12, 0.03, 0.245);
      rig.head.add(eye);
      rig.head.add(box(0.14, 0.025, 0.03, browMat, sx * 0.12, 0.12, 0.245));
    }

    // ── A dagger in each hand, blades pointing forward (swing with the arms) ──
    for (const arm of [rig.leftArm, rig.rightArm]) {
      const dagger = makeDagger();
      dagger.position.set(0, -0.74, 0.12);
      dagger.rotation.x = -Math.PI / 2 + 0.18; // tip points forward, angled slightly down
      arm.add(dagger);
    }

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(Zaex);
