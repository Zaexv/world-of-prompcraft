import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { NPC_Y_HEAD, NPC_TORSO_TOP } from '../../../entities/NPCAppearance';
import { buildLowPolyCharacter, finishCharacter, box, vmat } from './_LowPolyKit';
import type { VoxelDims } from './_VoxelKit';

// The Amphitheatre Manolos — five blokes drinking beer by the broken Roman
// amphitheatre, each holding a mug in their right hand. Differentiated by
// clothing colours and a small per-character accessory.

const FOAM = 0xf2e9d8;
const BEER = 0xd9a441;
const MUG_GLASS = 0xcfe8e8;

/** A beer mug (amber body + foam top) hung off the right-hand pivot. */
function addBeerMug(rightArm: THREE.Group): void {
  const mug = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.16, 8), vmat(BEER, { roughness: 0.25, metalness: 0.05 }));
  mug.add(body);
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.085, 0.04, 8), vmat(FOAM, { roughness: 0.9 }));
  foam.position.y = 0.1;
  mug.add(foam);
  const glass = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 8), vmat(MUG_GLASS, { roughness: 0.3, metalness: 0.2 }));
  glass.rotation.y = Math.PI / 2;
  glass.position.set(0.09, 0, 0);
  mug.add(glass);
  mug.position.y = -1.06; // roughly at the resting hand
  mug.position.x = -0.02;
  mug.castShadow = true;
  rightArm.add(mug);
}

const COMMON: Pick<VoxelDims, 'armW' | 'armD' | 'legW' | 'legD' | 'footColor' | 'clothKind'> = {
  armW: 0.21,
  armD: 0.23,
  legW: 0.24,
  legD: 0.27,
  footColor: 0x3a2c1d,
  clothKind: 'wool',
};

/** Sleeves match the torso colour by default for these short-sleeve shirts. */
function withArms(torsoColor: number): Pick<VoxelDims, 'armColor'> {
  return { armColor: torsoColor };
}

// ── Lluis — weary, married, blue polo shirt ──────────────────────────────
export class ManoloLluis extends Mesh {
  static readonly type = 'npc_individual_manolo_lluis';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Lluis';

    const rig = buildLowPolyCharacter(group, {
      ...COMMON,
      torsoW: 0.66, torsoD: 0.42, torsoColor: 0x2e5d8c, ...withArms(0x2e5d8c),
      headW: 0.5, headD: 0.48, skinColor: 0xc78a5c,
      legColor: 0x3c3a36,
    });

    // Wedding band on the raised hand.
    rig.rightArm.children
      .filter((c) => c instanceof THREE.Mesh && (c.geometry as THREE.IcosahedronGeometry).type === 'IcosahedronGeometry')
      .forEach((hand) => hand.add(box(0.05, 0.02, 0.05, vmat(0xd9c24a, { roughness: 0.3, metalness: 0.8 }), 0, -0.04, 0)));

    addBeerMug(rig.rightArm);

    // Tired half-lidded eyes.
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.07, 0.02, 0.03, eye, sx * 0.12, 0.06, 0.245));
    }

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

// ── Evil Carlos — black shirt, goatee, smirk ─────────────────────────────
export class ManoloEvilCarlos extends Mesh {
  static readonly type = 'npc_individual_manolo_evil_carlos';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Evil Carlos';

    const rig = buildLowPolyCharacter(group, {
      ...COMMON,
      torsoW: 0.66, torsoD: 0.42, torsoColor: 0x1c1c1c, ...withArms(0x1c1c1c),
      headW: 0.5, headD: 0.48, skinColor: 0xc78a5c,
      legColor: 0x2a2a2a,
    });

    addBeerMug(rig.rightArm);

    // Goatee + slanted "evil" eyebrows + faint red eye glow.
    const goatee = vmat(0x2a1c12, { roughness: 0.9 });
    rig.head.add(box(0.16, 0.08, 0.06, goatee, 0, -0.2, 0.245));
    const brow = vmat(0x1a1a1a, { roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const b = box(0.12, 0.03, 0.03, brow, sx * 0.12, 0.16, 0.245);
      b.rotation.z = -sx * 0.35;
      rig.head.add(b);
    }
    const eye = vmat(0x701010, { roughness: 0.4, emissive: 0x701010, emissiveIntensity: 0.4 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.06, 0.04, 0.03, eye, sx * 0.12, 0.07, 0.245));
    }

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

// ── Good Carlos — beige shirt, glasses, slumped sigh ─────────────────────
export class ManoloGoodCarlos extends Mesh {
  static readonly type = 'npc_individual_manolo_good_carlos';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Good Carlos';

    const rig = buildLowPolyCharacter(group, {
      ...COMMON,
      torsoW: 0.66, torsoD: 0.42, torsoColor: 0xe6dcc8, ...withArms(0xe6dcc8),
      headW: 0.5, headD: 0.48, skinColor: 0xc78a5c,
      legColor: 0x55483a,
    });

    addBeerMug(rig.rightArm);

    // Glasses (thin dark frame across the front of the head).
    const frame = vmat(0x2a2a2a, { roughness: 0.5, metalness: 0.4 });
    rig.head.add(box(0.34, 0.03, 0.02, frame, 0, 0.07, 0.25));
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.1, 0.1, 0.02, frame, sx * 0.12, 0.07, 0.25));
    }
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.06, 0.05, 0.04, eye, sx * 0.12, 0.07, 0.255));
    }

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

// ── Quino — green shirt, ring proudly raised, content smile ─────────────
export class ManoloQuino extends Mesh {
  static readonly type = 'npc_individual_manolo_quino';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Quino';

    const rig = buildLowPolyCharacter(group, {
      ...COMMON,
      torsoW: 0.68, torsoD: 0.44, torsoColor: 0x3f7a3f, ...withArms(0x3f7a3f),
      headW: 0.5, headD: 0.48, skinColor: 0xc78a5c,
      legColor: 0x3c3a36,
    });

    addBeerMug(rig.rightArm);

    // Big wedding band on the mug hand, worn proudly.
    rig.rightArm.children
      .filter((c) => c instanceof THREE.Mesh && (c.geometry as THREE.IcosahedronGeometry).type === 'IcosahedronGeometry')
      .forEach((hand) => hand.add(box(0.06, 0.025, 0.06, vmat(0xd9c24a, { roughness: 0.25, metalness: 0.85 }), 0, -0.05, 0)));

    // Content, slightly raised eyebrows + smile line.
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.06, 0.05, 0.04, eye, sx * 0.12, 0.07, 0.245));
    }
    rig.head.add(box(0.18, 0.03, 0.02, vmat(0x8a5a3c, { roughness: 0.6 }), 0, -0.16, 0.245));

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

// ── Kevin — grey hoodie, single, slumped posture, empty side glance ─────
export class ManoloKevin extends Mesh {
  static readonly type = 'npc_individual_manolo_kevin';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Kevin';

    const rig = buildLowPolyCharacter(group, {
      ...COMMON,
      torsoW: 0.66, torsoD: 0.42, torsoColor: 0x6b6b6b, ...withArms(0x6b6b6b),
      headW: 0.5, headD: 0.48, skinColor: 0xc78a5c,
      legColor: 0x2e2e33,
    });

    addBeerMug(rig.rightArm);

    // Hoodie strings.
    const stringMat = vmat(0xd8d8d8, { roughness: 0.7, kind: 'wool' });
    for (const sx of [-1, 1]) {
      group.add(box(0.02, 0.18, 0.02, stringMat, sx * 0.06, NPC_TORSO_TOP - 0.05, 0.22));
    }

    // Hoodie hood draped over the back of the head.
    group.add(box(0.56, 0.14, 0.5, vmat(0x6b6b6b, { roughness: 0.85, kind: 'wool' }), 0, NPC_Y_HEAD + 0.28, -0.04));

    // Downcast eyes — staring at the empty seat beside him.
    const eye = vmat(0x2a1c12, { roughness: 0.3 });
    for (const sx of [-1, 1]) {
      rig.head.add(box(0.06, 0.03, 0.03, eye, sx * 0.12, 0.03, 0.245));
    }

    finishCharacter(group);
    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(ManoloLluis);
registerMesh(ManoloEvilCarlos);
registerMesh(ManoloGoodCarlos);
registerMesh(ManoloQuino);
registerMesh(ManoloKevin);
