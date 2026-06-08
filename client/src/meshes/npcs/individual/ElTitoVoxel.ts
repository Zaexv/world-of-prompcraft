import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_TORSO, NPC_Y_HEAD } from '../../../entities/NPCAppearance';
import { buildVoxelCharacter, addCloak, finishCharacter, box, vmat } from './_VoxelKit';

// Reference: docs/assets/characters/tito.png
// Classic sorcerer: royal-blue robe + tall floppy hat covered in golden stars,
// crescent moons and crosses; thick brown beard; smoking a pipe.
const ROBE = 0x2e4cbf;
const HAT = 0x27409c;
const GOLD = 0xf2c83a;
const SKIN = 0xcb9d75;
const BEARD = 0x6b4a2e;
const BOOT = 0x4a3018;

function starMat(): THREE.MeshStandardMaterial {
  return vmat(GOLD, { roughness: 0.55, emissive: GOLD, emissiveIntensity: 0.35 });
}

/** Flat four-point star (two crossed thin boxes), facing +z. */
function star(size: number): THREE.Group {
  const g = new THREE.Group();
  const m = starMat();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.3, 0.015), m));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(size * 0.3, size, 0.015), m));
  return g;
}

/** Flat crescent moon facing +z. */
function moon(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r, 14, 1, 0, Math.PI * 1.25), starMat());
  return m;
}

export class ElTitoVoxel extends Mesh {
  // Must match manifest NPC id `eltito_01` (resolver keys on npc_individual_<id>).
  static readonly type = 'npc_individual_eltito_01_voxel';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'El Tito';

    const rig = buildVoxelCharacter(group, {
      torsoW: 0.60, torsoD: 0.40, torsoColor: ROBE,
      headW: 0.50, headD: 0.48, skinColor: SKIN,
      armW: 0.20, armD: 0.22, armColor: ROBE,
      legW: 0.22, legD: 0.26, legColor: ROBE,
      footColor: BOOT,
      clothKind: 'silk', // royal-blue sorcerer robe — glossy silk, not leather
    });

    // ── Golden symbols scattered across the robe ──
    const decals: Array<{ kind: 'star' | 'moon' | 'cross'; x: number; y: number; z: number; s: number }> = [
      { kind: 'star', x: -0.15, y: NPC_Y_TORSO + 0.26, z: 0.205, s: 0.13 },
      { kind: 'cross', x: 0.15, y: NPC_Y_TORSO + 0.10, z: 0.205, s: 0.11 },
      { kind: 'moon', x: -0.13, y: NPC_Y_TORSO - 0.14, z: 0.205, s: 0.09 },
      { kind: 'star', x: 0.12, y: NPC_Y_TORSO - 0.30, z: 0.205, s: 0.10 },
      { kind: 'cross', x: 0.0, y: NPC_Y_TORSO + 0.02, z: -0.205, s: 0.11 },
    ];
    for (const d of decals) {
      let m: THREE.Object3D;
      if (d.kind === 'moon') m = moon(d.s);
      else m = star(d.s);
      if (d.kind === 'cross') m.rotation.z = Math.PI / 4;
      m.position.set(d.x, d.y, d.z);
      if (d.z < 0) m.rotation.y = Math.PI;
      group.add(m);
    }
    // A star on each sleeve and lower-robe leg.
    for (const arm of [rig.leftArm, rig.rightArm]) {
      const s = star(0.08);
      s.position.set(0, -0.34, 0.13);
      arm.add(s);
    }
    for (const leg of [rig.leftLeg, rig.rightLeg]) {
      const s = star(0.08);
      s.position.set(0, -0.45, 0.15);
      leg.add(s);
    }

    // ── Tall floppy hat (nods with the head) ──
    const hatMat = vmat(HAT, { roughness: 0.8, kind: 'silk' });
    rig.head.add(box(0.64, 0.07, 0.64, hatMat, 0, 0.29, 0));  // brim
    const segs = 7;
    let hy = 0.34;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const w = 0.40 - t * 0.34;
      const lean = t * t * 0.22; // tip flops forward
      const seg = box(w, 0.13, w, hatMat, lean, hy, lean * 0.4);
      rig.head.add(seg);
      if (i % 2 === 0 && i < segs - 1) {
        const s = star(0.07);
        s.position.set(lean, hy, w / 2 + 0.01);
        rig.head.add(s);
      }
      hy += 0.12;
    }
    const hatMoon = moon(0.08);
    hatMoon.position.set(0.04, 0.50, 0.20);
    rig.head.add(hatMoon);

    // ── Brown beard + eyes ──
    const beardMat = vmat(BEARD, { roughness: 0.9 });
    rig.head.add(box(0.44, 0.30, 0.15, beardMat, 0, -0.15, 0.19));
    rig.head.add(box(0.32, 0.22, 0.13, beardMat, 0, -0.38, 0.17));
    rig.head.add(box(0.18, 0.16, 0.11, beardMat, 0, -0.55, 0.15));
    rig.head.add(box(0.32, 0.07, 0.06, beardMat, 0, 0.0, 0.235));  // moustache
    // El Tito has no eyes — the reflective lenses hide them entirely.

    // ── Square white glasses, real glass reflection (parented to the head, so they nod) ──
    // White frames + physically-shaded glass lenses that reflect the scene's
    // PMREM sky environment (set in SceneManager) plus a clearcoat specular so
    // they catch sunlight even where the env map is weak.
    const frameMat = (): THREE.MeshStandardMaterial =>
      vmat(0xffffff, { roughness: 0.12, metalness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.12 });
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.03,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 1.0,
      envMapIntensity: 2.5,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.6,
      flatShading: true,
    });
    const half = 0.085;   // half lens width
    const t = 0.018;      // frame bar thickness
    const eyeY = 0.11;
    const eyeZ = 0.26;
    for (const sx of [-1, 1]) {
      const cx = sx * 0.12;
      // Square frame: top/bottom/left/right bars.
      rig.head.add(box(half * 2 + t, t, t, frameMat(), cx, eyeY + half, eyeZ));
      rig.head.add(box(half * 2 + t, t, t, frameMat(), cx, eyeY - half, eyeZ));
      rig.head.add(box(t, half * 2 + t, t, frameMat(), cx - half, eyeY, eyeZ));
      rig.head.add(box(t, half * 2 + t, t, frameMat(), cx + half, eyeY, eyeZ));
      // Reflective square lens, set slightly back inside the frame.
      rig.head.add(box(half * 2 - t * 0.5, half * 2 - t * 0.5, 0.01, lensMat, cx, eyeY, eyeZ - 0.008));
      // Temple arm running back toward the ear.
      rig.head.add(box(t, t, 0.16, frameMat(), sx * 0.2, eyeY, eyeZ - 0.12));
    }
    // Bridge across the nose.
    rig.head.add(box(0.07, t, t, frameMat(), 0, eyeY, eyeZ));

    // ── Smoking pipe ──
    const pipe = new THREE.Group();
    const stem = box(0.18, 0.024, 0.024, vmat(0x3a2515, { roughness: 0.7 }), 0, 0, 0);
    pipe.add(stem);
    pipe.add(box(0.06, 0.08, 0.06, vmat(0x2a1a10, { roughness: 0.7 }), 0.1, 0.04, 0));
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), vmat(0xff5522, { emissive: 0xff3300, emissiveIntensity: 4 }));
    ember.position.set(0.1, 0.085, 0);
    pipe.add(ember);
    pipe.position.set(0.14, NPC_Y_HEAD - 0.14, 0.26);
    group.add(pipe);

    addCloak(group, 0.40, 0.52, 1.0, ROBE, 'silk');

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(ElTitoVoxel);
