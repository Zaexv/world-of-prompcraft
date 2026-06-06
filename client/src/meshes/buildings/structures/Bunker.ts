import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { applyWorldTiling } from '../worldTiled';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';

/**
 * WW2 German "Regelbau"-style reinforced-concrete bunker / pillbox — WALKABLE.
 *
 * Squat low-profile blockhouse with a real hollow interior: four thick concrete
 * walls on a deep foundation slab, a flat slab roof/ceiling, a narrow horizontal
 * embrasure (gun slit) on the front, and an open armored doorway at the rear the
 * player can walk through. An interior firing step sits under the slit.
 *
 * Ground handling: placement snaps the mesh ORIGIN to the terrain height at a
 * single (x,z) sample, but the footprint is large and terrain varies under it.
 * So the floor slab sits a lip ABOVE the origin (`FLOOR_LIFT`) and the
 * foundation runs DEEP below it (`BASE_H`), keeping any terrain bumps buried in
 * solid concrete instead of poking through the interior floor.
 *
 * Front face is +Z, rear doorway is -Z. All offsets are `* scale`.
 */
const W = 8; // outer width
const H = 3; // wall height
const D = 6; // outer depth
const WALL_T = 0.6; // wall thickness
const FLOOR_LIFT = 0.3; // floor top sits this far above the terrain sample point
const BASE_H = 3.0; // deep foundation slab — buries terrain variation under the footprint
const ROOF_H = 0.5;
const DOOR_GAP = 1.6; // rear doorway opening width
const DOOR_H = 2.2; // rear doorway opening height
const INNER_W = W - 2 * WALL_T; // span between the side walls
const SEG_W = (INNER_W - DOOR_GAP) / 2; // width of each rear wall segment
const SIDE_X = W / 2 - WALL_T / 2; // |x| of side-wall centres
const FB_Z = D / 2 - WALL_T / 2; // |z| of front/rear wall centres
const SEG_X = DOOR_GAP / 2 + SEG_W / 2; // |x| of rear-segment centres
const LINTEL_H = H - DOOR_H; // concrete over the doorway
const WALL_CY = FLOOR_LIFT + H / 2; // wall centre Y (walls rise from the floor lip)

function buildBunkerGroup(scale: number, detail: boolean): THREE.Group {
  const g = new THREE.Group();

  const concrete = new THREE.MeshStandardMaterial({ color: 0x8b8d86, roughness: 0.97 });
  applyStonePBR(concrete);
  concrete.userData.flatColor = 0x8b8d86;

  const dark = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.9 });
  dark.userData.flatColor = 0x16181a;

  // Convenience: render walls never collide (explicit proxies do that), and the
  // hollow body must cast/receive shadow so the interior reads as enclosed.
  const wall = (w: number, h: number, d: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * scale, h * scale, d * scale), concrete);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.noCollision = true;
    return m;
  };

  // 1. Deep foundation skirt — wider footprint, top at the floor lip, running
  //    far below so terrain bumps stay buried in concrete.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry((W + 0.6) * scale, BASE_H * scale, (D + 0.6) * scale),
    concrete,
  );
  base.position.y = (FLOOR_LIFT - BASE_H / 2) * scale; // top at FLOOR_LIFT, slab sunk below
  base.receiveShadow = true;
  base.userData.noCollision = true;
  g.add(base);

  // 2. Side walls — full depth, forming the corners.
  const left = wall(WALL_T, H, D);
  left.position.set(-SIDE_X * scale, WALL_CY * scale, 0);
  g.add(left);
  const right = wall(WALL_T, H, D);
  right.position.set(SIDE_X * scale, WALL_CY * scale, 0);
  g.add(right);

  // 3. Front wall — buried 0.04 into the side walls to avoid coplanar corners.
  const front = wall(INNER_W + 0.04, H, WALL_T);
  front.position.set(0, WALL_CY * scale, FB_Z * scale);
  g.add(front);

  // 4. Rear wall — two segments + lintel, leaving an open doorway.
  const rearL = wall(SEG_W + 0.04, H, WALL_T);
  rearL.position.set(-SEG_X * scale, WALL_CY * scale, -FB_Z * scale);
  g.add(rearL);
  const rearR = wall(SEG_W + 0.04, H, WALL_T);
  rearR.position.set(SEG_X * scale, WALL_CY * scale, -FB_Z * scale);
  g.add(rearR);
  const lintel = wall(DOOR_GAP + 0.04, LINTEL_H, WALL_T);
  lintel.position.set(0, (FLOOR_LIFT + DOOR_H + LINTEL_H / 2) * scale, -FB_Z * scale);
  g.add(lintel);

  // 5. Slab roof / ceiling with overhang, sunk into the wall tops.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry((W + 0.7) * scale, ROOF_H * scale, (D + 0.7) * scale),
    concrete,
  );
  roof.position.y = (FLOOR_LIFT + H + ROOF_H / 2 - 0.08) * scale;
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData.noCollision = true;
  g.add(roof);

  // 6. Embrasure (gun slit) — dark recess punched through the front wall.
  const slit = new THREE.Mesh(
    new THREE.BoxGeometry(3.2 * scale, 0.45 * scale, (WALL_T + 0.1) * scale),
    dark,
  );
  slit.position.set(0, (FLOOR_LIFT + 1.55) * scale, FB_Z * scale);
  slit.userData.noCollision = true;
  g.add(slit);

  // 7. Interior firing step under the slit (concrete bench).
  const step = new THREE.Mesh(new THREE.BoxGeometry(3.2 * scale, 0.7 * scale, 0.8 * scale), concrete);
  step.position.set(0, (FLOOR_LIFT + 0.35) * scale, (FB_Z - WALL_T / 2 - 0.4) * scale);
  step.castShadow = true;
  step.receiveShadow = true;
  step.userData.noCollision = true;
  g.add(step);

  if (detail) {
    // 6b. Concrete brow proud above the slit.
    const brow = wall(3.8, 0.4, 0.5);
    brow.position.set(0, (FLOOR_LIFT + 2.0) * scale, (FB_Z + 0.12) * scale);
    g.add(brow);

    // 4b. Proud doorway frame around the rear opening.
    const frameTop = wall(DOOR_GAP + 0.8, 0.3, 0.25);
    frameTop.position.set(0, (FLOOR_LIFT + DOOR_H + 0.15) * scale, (-FB_Z - 0.12) * scale);
    g.add(frameTop);
    for (const sx of [-1, 1]) {
      const jamb = wall(0.3, DOOR_H + 0.3, 0.25);
      jamb.position.set(
        sx * (DOOR_GAP / 2 + 0.15) * scale,
        (FLOOR_LIFT + DOOR_H / 2) * scale,
        (-FB_Z - 0.12) * scale,
      );
      g.add(jamb);
    }

    // 8. Weathering chips at the foot — sunk slightly so they meet sloped ground.
    const chips: Array<[number, number, number]> = [
      [W / 2 + 0.4, FB_Z - 1.2, 0.5],
      [-W / 2 - 0.5, -1.0, 0.4],
      [1.5, -FB_Z - 0.8, 0.45],
    ];
    for (const [cx, cz, cs] of chips) {
      const chip = new THREE.Mesh(
        new THREE.BoxGeometry(cs * scale, cs * 0.6 * scale, cs * scale),
        concrete,
      );
      chip.position.set(cx * scale, (cs * 0.3 - 0.1) * scale, cz * scale);
      chip.rotation.y = cx * 0.7;
      chip.castShadow = true;
      chip.userData.noCollision = true;
      g.add(chip);
    }
  }

  applyWorldTiling(g, concrete);
  return g;
}

/** Per-wall convex collision proxies — leave the rear doorway open to walk in. */
function addColliders(lod: THREE.LOD, scale: number): void {
  const add = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const c = boxCollider(w * scale, h * scale, d * scale);
    c.position.set(x * scale, y * scale, z * scale);
    lod.add(c);
  };
  add(W + 0.6, BASE_H, D + 0.6, 0, FLOOR_LIFT - BASE_H / 2, 0); // floor slab
  add(WALL_T, H, D, -SIDE_X, WALL_CY, 0); // left wall
  add(WALL_T, H, D, SIDE_X, WALL_CY, 0); // right wall
  add(INNER_W, H, WALL_T, 0, WALL_CY, FB_Z); // front wall
  add(SEG_W, H, WALL_T, -SEG_X, WALL_CY, -FB_Z); // rear-left segment
  add(SEG_W, H, WALL_T, SEG_X, WALL_CY, -FB_Z); // rear-right segment
  add(DOOR_GAP, LINTEL_H, WALL_T, 0, FLOOR_LIFT + DOOR_H + LINTEL_H / 2, -FB_Z); // doorway lintel
  add(W, ROOF_H, D, 0, FLOOR_LIFT + H + ROOF_H / 2, 0); // roof ceiling
}

export class Bunker extends Mesh {
  static readonly type = 'bunker';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    lod.addLevel(buildBunkerGroup(scale, true), 0);    // Full (0–200)
    lod.addLevel(buildBunkerGroup(scale, false), 200); // Mid/Low — hollow shell only

    addColliders(lod, scale);
    return lod;
  }
}

registerMesh(Bunker);
