import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_TORSO_TOP, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, addCloak, finishCharacter, box, vmat } from './_LowPolyKit';

// Tutorial-Man — the friendly, slightly fourth-wall-breaking guide who greets
// every new player. A luminous azure-and-gold mentor robe with glowing rune
// trim, a star-tipped pointed cap, a kindly bearded face, an open spellbook
// (the "Beginner's Guide") floating at his side, and sparkle motes drifting
// around him. The glow accents push past the bloom threshold so the engine's
// bloom pass makes him gently radiant — he reads as the helpful "start here" NPC.
const ROBE = 0x2a7c9c;       // welcoming azure
const ROBE_DK = 0x1f5e77;
const GOLD = 0xe8c33a;
const GLOW = 0x6fe8ff;       // arcane cyan glow
const SKIN = 0xd6a878;
const BEARD = 0xb8b4ac;      // kindly grey
const BOOK = 0x9a3a2a;       // red leather cover
const PAGE = 0xf4ecd6;
const BOOT = 0x3a2c1d;

function glowMat(intensity = 3.0): THREE.MeshStandardMaterial {
  return vmat(GLOW, { roughness: 0.2, emissive: GLOW, emissiveIntensity: intensity });
}

export class TutorialMan extends Mesh {
  static readonly type = 'npc_individual_tutorial_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Tutorial-Man';

    const rig = buildLowPolyCharacter(group, {
      torsoW: 0.62, torsoD: 0.40, torsoColor: ROBE,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.20, armD: 0.22, armColor: ROBE,
      legW: 0.22, legD: 0.26, legColor: ROBE_DK,
      footColor: BOOT,
      clothKind: 'silk',
    });

    const goldFn = (): THREE.MeshStandardMaterial => vmat(GOLD, { roughness: 0.4, metalness: 0.7, kind: 'gold' });

    // ── Robe trim: glowing centre seam + V-collar + gold belt ──
    group.add(box(0.07, 0.74, 0.02, glowMat(2.2), 0, NPC_Y_TORSO, 0.205));
    group.add(box(0.42, 0.08, 0.02, goldFn(), 0, NPC_Y_TORSO + 0.32, 0.205));
    group.add(box(0.66, 0.10, 0.44, goldFn(), 0, NPC_Y_TORSO - 0.30, 0));
    // Glowing rune dots scattered down the robe.
    for (const [rx, ry] of [[-0.16, 0.18], [0.15, 0.02], [-0.13, -0.16], [0.14, -0.30]]) {
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), glowMat(3.2));
      rune.position.set(rx, NPC_Y_TORSO + ry, 0.215);
      group.add(rune);
    }
    // Gold cuffs that swing with the arms; left hand raised in a welcoming wave.
    for (const arm of [rig.leftArm, rig.rightArm]) {
      arm.add(box(0.23, 0.10, 0.25, goldFn(), 0, -0.60, 0));
    }
    rig.leftArm.rotation.z = -0.5;  // raised wave
    rig.leftArm.rotation.x = -0.2;

    // Long flared lower robe over the legs.
    const robeSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.46, 0.7, 10), vmat(ROBE, { roughness: 0.6, kind: 'silk' }));
    robeSkirt.position.y = NPC_Y_TORSO - 0.62;
    robeSkirt.castShadow = true;
    group.add(robeSkirt);

    // ── Star-tipped pointed cap (nods with the head) ──
    const hatMat = vmat(ROBE_DK, { roughness: 0.55, kind: 'silk' });
    rig.head.add(box(0.56, 0.07, 0.54, goldFn(), 0, 0.27, 0));          // gold brim
    const segs = 6;
    let hy = 0.32;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const w = 0.42 - t * 0.36;
      const seg = box(w, 0.12, w, hatMat, 0, hy, 0);
      rig.head.add(seg);
      hy += 0.11;
    }
    // Glowing star at the tip.
    const star = new THREE.Group();
    const sm = glowMat(4.0);
    star.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), sm));
    star.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), sm));
    star.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), sm));
    star.position.set(0, hy + 0.04, 0);
    rig.head.add(star);

    // ── Kindly bearded face with glowing friendly eyes ──
    const beardMat = vmat(BEARD, { roughness: 0.9 });
    rig.head.add(box(0.42, 0.22, 0.13, beardMat, 0, -0.16, 0.20));
    rig.head.add(box(0.28, 0.16, 0.11, beardMat, 0, -0.36, 0.18));
    rig.head.add(box(0.30, 0.06, 0.06, beardMat, 0, 0.0, 0.235));       // moustache
    const eyeMat = glowMat(2.0);
    for (const sx of [-1, 1]) rig.head.add(box(0.06, 0.05, 0.04, eyeMat, sx * 0.11, 0.08, 0.245));
    rig.head.add(box(0.18, 0.03, 0.03, vmat(0x7a4030, { roughness: 0.6 }), 0, -0.06, 0.245)); // smile

    // ── Open spellbook (the "Beginner's Guide") floating at his right side ──
    const bookGrp = new THREE.Group();
    const coverMat = vmat(BOOK, { roughness: 0.5 });
    const pageMat = vmat(PAGE, { roughness: 0.8 });
    for (const sx of [-1, 1]) {
      const cover = box(0.22, 0.02, 0.3, coverMat, sx * 0.12, 0, 0);
      cover.rotation.x = sx * 0.18;
      bookGrp.add(cover);
      const page = box(0.2, 0.012, 0.27, pageMat, sx * 0.115, 0.02, 0);
      page.rotation.x = sx * 0.16;
      bookGrp.add(page);
    }
    // Glowing rune-text lines on the open pages.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        bookGrp.add(box(0.14, 0.006, 0.02, glowMat(2.6), sx * 0.115, 0.03, -0.07 + i * 0.07));
      }
    }
    bookGrp.position.set(0.62, NPC_Y_TORSO + 0.10, 0.18);
    bookGrp.rotation.y = -0.4;
    group.add(bookGrp);

    // ── Sparkle motes drifting around him ──
    for (const [mx, my, mz] of [
      [0.5, NPC_Y_HEAD + 0.1, 0.3], [-0.45, NPC_TORSO_TOP + 0.2, 0.25],
      [0.35, NPC_Y_TORSO - 0.1, -0.3], [-0.3, NPC_Y_HEAD + 0.25, -0.1],
    ]) {
      const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), glowMat(4.5));
      mote.position.set(mx, my, mz);
      group.add(mote);
    }

    // Flowing azure cloak.
    addCloak(group, 0.40, 0.52, 1.0, ROBE_DK, 'silk');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(TutorialMan);
