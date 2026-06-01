import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import type { Rng } from '../../../systems/worldbuilder/RngTypes';
import {
  getMaterials,
  type MedMaterials,
  createArchedDoor,
  createWindowWithGrille,
  createWoodenShutters,
  createFlowerPot,
  createChimney,
  withLOD,
} from './MalakaKit';
import { applyBarkPBR, applyCanopyPBR } from '../../../utils/PBRMaps';
import { boxCollider, cylinderCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

/**
 * MalakaFarm — an Andalusian olive farmstead (`cortijo` + `olivar`).
 *
 * A self-contained landmark composed of a walkable whitewashed farmhouse (open
 * doorway, furnished interior with a hearth), a tilled crop plot, a grid of
 * silvery olive trees forming the grove, flanking cypresses, a stone well, hay
 * bales and a low drystone boundary with a gated entrance. It reuses the shared
 * Málaga material cache so it tiles and LODs consistently with the rest of the
 * Mediterranean set.
 *
 * Collision: walls/well/trees/furniture carry tagged proxies, so the front
 * doorway is left clear and the player can walk inside.
 */

// ─── Local material cache (foliage / soil — outside the masonry kit) ──────────

interface FarmMaterials {
  oliveLeaf: THREE.MeshStandardMaterial;
  oliveTrunk: THREE.MeshStandardMaterial;
  cypress: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  soilDark: THREE.MeshStandardMaterial;
  crop: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  hay: THREE.MeshStandardMaterial;
  clay: THREE.MeshStandardMaterial;
  ember: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
}

let _farmMats: FarmMaterials | null = null;

function getFarmMaterials(): FarmMaterials {
  if (!_farmMats) {
    const oliveLeaf = new THREE.MeshStandardMaterial({ color: 0x8a9a6b, roughness: 0.9 });
    applyCanopyPBR(oliveLeaf);
    oliveLeaf.color.set(0x8a9a6b); // sage/silver olive green over the canopy normal map
    oliveLeaf.userData.flatColor = 0x6f7d52;

    const oliveTrunk = new THREE.MeshStandardMaterial({ color: 0x6b5d4c, roughness: 0.95 });
    applyBarkPBR(oliveTrunk);
    oliveTrunk.userData.flatColor = 0x564a3b;

    const cypress = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.9 });
    applyCanopyPBR(cypress);
    cypress.color.set(0x2f4a2c);
    cypress.userData.flatColor = 0x2a4228;

    _farmMats = {
      oliveLeaf,
      oliveTrunk,
      cypress,
      soil: (() => {
        const m = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1.0 });
        m.userData.flatColor = 0x5a4632;
        return m;
      })(),
      soilDark: (() => {
        const m = new THREE.MeshStandardMaterial({ color: 0x4a3829, roughness: 1.0 });
        m.userData.flatColor = 0x4a3829;
        return m;
      })(),
      crop: (() => {
        const m = new THREE.MeshStandardMaterial({ color: 0x9aa84a, roughness: 0.95 });
        m.userData.flatColor = 0x8a9742;
        return m;
      })(),
      tile: (() => {
        const m = new THREE.MeshStandardMaterial({ color: 0xb5623c, roughness: 0.85 });
        m.userData.flatColor = 0xa1583a;
        return m;
      })(),
      hay: (() => {
        const m = new THREE.MeshStandardMaterial({ color: 0xd9b44a, roughness: 1.0 });
        m.userData.flatColor = 0xc6a343;
        return m;
      })(),
      clay: new THREE.MeshStandardMaterial({ color: 0x9c5a3c, roughness: 0.9 }),
      ember: new THREE.MeshStandardMaterial({
        color: 0xff6a1a,
        emissive: 0xff5500,
        emissiveIntensity: 1.4,
        roughness: 0.6,
      }),
      water: new THREE.MeshStandardMaterial({
        color: 0x2c4a55,
        metalness: 0.6,
        roughness: 0.15,
      }),
    };
  }
  return _farmMats;
}

// ─── Shared geometry cache (one buffer reused across every instance) ──────────

interface OliveGeo {
  trunk: THREE.CylinderGeometry;
  branch: THREE.CylinderGeometry;
  blob: THREE.IcosahedronGeometry;
}
let _oliveGeo: OliveGeo | null = null;
function getOliveGeo(): OliveGeo {
  if (!_oliveGeo) {
    _oliveGeo = {
      trunk: new THREE.CylinderGeometry(0.18, 0.32, 1.5, 6),
      branch: new THREE.CylinderGeometry(0.07, 0.12, 1.1, 5),
      blob: new THREE.IcosahedronGeometry(0.95, 0),
    };
  }
  return _oliveGeo;
}

// ─── Deterministic RNG (stable per placement; falls back to position hash) ────

function makeLocalRng(seedInput: number): Rng {
  let s = seedInput >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt: (n: number) => Math.floor(next() * n),
    nextRange: (lo: number, hi: number) => lo + next() * (hi - lo),
    chance: (p: number) => next() < p,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
  };
}

// ─── Sub-builders ─────────────────────────────────────────────────────────────

/** A gnarled olive tree: short twisted trunk + silvery rounded canopy clusters. */
function buildOliveTree(scale: number, rng: Rng, fm: FarmMaterials): THREE.Group {
  const g = new THREE.Group();
  const geo = getOliveGeo();
  const s = scale;

  const trunk = new THREE.Mesh(geo.trunk, fm.oliveTrunk);
  trunk.scale.setScalar(s);
  trunk.position.y = 0.75 * s;
  trunk.rotation.z = rng.nextRange(-0.08, 0.08);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true; // walkable-around trunk
  g.add(trunk);

  // A couple of forking branches for the characteristic olive silhouette.
  const forks = 2 + rng.nextInt(2);
  for (let i = 0; i < forks; i++) {
    const a = (i / forks) * Math.PI * 2 + rng.nextRange(-0.4, 0.4);
    const branch = new THREE.Mesh(geo.branch, fm.oliveTrunk);
    branch.scale.setScalar(s);
    branch.position.set(Math.cos(a) * 0.25 * s, 1.4 * s, Math.sin(a) * 0.25 * s);
    branch.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    branch.castShadow = true;
    branch.userData.noCollision = true;
    g.add(branch);
  }

  // 3–4 overlapping leaf clusters forming the loose canopy.
  const blobs = 3 + rng.nextInt(2);
  const canopyY = 2.2 * s;
  for (let i = 0; i < blobs; i++) {
    const blob = new THREE.Mesh(geo.blob, fm.oliveLeaf);
    const a = (i / blobs) * Math.PI * 2;
    const r = rng.nextRange(0.3, 0.7) * s;
    blob.position.set(Math.cos(a) * r, canopyY + rng.nextRange(-0.3, 0.4) * s, Math.sin(a) * r);
    blob.scale.setScalar(rng.nextRange(0.85, 1.25) * s);
    blob.castShadow = true;
    blob.receiveShadow = true;
    blob.userData.noCollision = true;
    g.add(blob);
  }

  return g;
}

/** A tall, narrow Mediterranean cypress — a dark vertical accent. */
function buildCypress(scale: number, fm: FarmMaterials): THREE.Group {
  const g = new THREE.Group();
  const s = scale;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.2 * s, 6), fm.oliveTrunk);
  trunk.position.y = 0.6 * s;
  trunk.castShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  // Stacked tapering cones read as the dense columnar foliage.
  const tiers = 4;
  const totalH = 6.5 * s;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry((0.9 - t * 0.55) * s, (totalH / tiers) * 1.6, 7),
      fm.cypress,
    );
    cone.position.y = 1.0 * s + t * totalH * 0.9 + totalH / (tiers * 2);
    cone.castShadow = true;
    cone.receiveShadow = true;
    cone.userData.noCollision = true;
    g.add(cone);
  }
  return g;
}

/** A stone well with a tiled half-roof on two posts and a hanging bucket. */
function buildWell(scale: number, mats: MedMaterials, fm: FarmMaterials): THREE.Group {
  const g = new THREE.Group();
  const s = scale;

  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 0.95 * s, 1.0 * s, 14), mats.stone);
  wall.position.y = 0.5 * s;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  const wallProxy = cylinderCollider(0.95 * s, 1.0 * s, 12);
  wallProxy.position.y = 0.5 * s;
  g.add(wallProxy);

  const water = new THREE.Mesh(new THREE.CircleGeometry(0.78 * s, 14), fm.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.7 * s;
  water.userData.noCollision = true;
  g.add(water);

  // Two posts + a little pitched roof.
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 1.7 * s, 0.14 * s), mats.wood);
    post.position.set(sx * 0.85 * s, 1.35 * s, 0);
    post.castShadow = true;
    post.userData.noCollision = true;
    g.add(post);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2 * s, 0.7 * s, 4), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.5 * s;
  roof.castShadow = true;
  roof.userData.noCollision = true;
  g.add(roof);

  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.13 * s, 0.24 * s, 8), mats.wood);
  bucket.position.set(0, 1.5 * s, 0);
  bucket.userData.noCollision = true;
  g.add(bucket);

  return g;
}

/** A rounded hay bale. */
function buildHayBale(scale: number, fm: FarmMaterials): THREE.Mesh {
  const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * scale, 0.7 * scale, 1.0 * scale, 12), fm.hay);
  bale.rotation.z = Math.PI / 2;
  bale.position.y = 0.7 * scale;
  bale.castShadow = true;
  bale.receiveShadow = true;
  bale.userData.isCollider = true;
  return bale;
}

/** A terracotta amphora / oil jar. */
function buildAmphora(scale: number, fm: FarmMaterials): THREE.Group {
  const g = new THREE.Group();
  const s = scale;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 10, 8), fm.clay);
  body.scale.y = 1.4;
  body.position.y = 0.42 * s;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 0.25 * s, 8), fm.clay);
  neck.position.y = 0.85 * s;
  g.add(neck);
  g.traverse((c) => { c.userData.noCollision = true; });
  return g;
}

/**
 * The walkable farmhouse: four thin whitewashed walls (front split for an open
 * doorway), a tiled hip roof, side windows, and a furnished interior with a
 * hearth, table, benches and a shelf. Built around its own local origin.
 */
function buildFarmhouse(scale: number, mats: MedMaterials, fm: FarmMaterials): THREE.Group {
  const g = new THREE.Group();
  const s = scale;
  const W = 9 * s;
  const D = 7 * s;
  const H = 3.4 * s;
  const t = 0.4 * s; // wall thickness
  const doorW = 1.8 * s;
  const doorH = 2.4 * s;

  // Foundation / interior floor
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3 * s, 0.4 * s, D + 0.3 * s), mats.stone);
  foundation.position.y = 0.2 * s;
  foundation.receiveShadow = true;
  g.add(foundation);
  const foundProxy = boxCollider(W + 0.3 * s, 0.4 * s, D + 0.3 * s);
  foundProxy.position.y = 0.2 * s;
  g.add(foundProxy);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * t, D - 2 * t), fm.tile);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.43 * s;
  floor.receiveShadow = true;
  floor.userData.noCollision = true;
  g.add(floor);

  const wallY = 0.4 * s + H / 2;

  // Helper to add a wall box + collider together.
  const addWall = (w: number, d: number, x: number, z: number): void => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mats.stucco);
    wall.position.set(x, wallY, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
    const proxy = boxCollider(w, H, d);
    proxy.position.set(x, wallY, z);
    g.add(proxy);
  };

  addWall(W, t, 0, -D / 2 + t / 2);                 // back
  addWall(t, D, -W / 2 + t / 2, 0);                 // left
  addWall(t, D, W / 2 - t / 2, 0);                  // right

  // Front wall: two segments leaving a central doorway.
  const segW = (W - doorW) / 2;
  addWall(segW, t, -(doorW / 2 + segW / 2), D / 2 - t / 2);
  addWall(segW, t, doorW / 2 + segW / 2, D / 2 - t / 2);

  // Lintel filling the wall above the open doorway (high → no collision).
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + t, H - doorH, t), mats.stucco);
  lintel.position.set(0, 0.4 * s + doorH + (H - doorH) / 2, D / 2 - t / 2);
  lintel.castShadow = true;
  lintel.userData.noCollision = true;
  g.add(lintel);

  // Stone door surround with the opening kept clear (so the interior is walkable).
  const surround = createArchedDoor(doorW, doorH, 0.25 * s, mats);
  surround.position.set(0, 0.4 * s, D / 2 + 0.02 * s);
  surround.traverse((c) => { c.userData.noCollision = true; });

  // Make the door "opened" by grouping the panel parts and rotating them.
  // The first two children (box and arch cylinder) and the handle (fourth) are the panel.
  const doorPanel = new THREE.Group();
  const panelParts = [surround.children[0], surround.children[1], surround.children[3]];
  
  // Pivot around the left hinge (from outside)
  const hingeX = -doorW / 2;
  for (const p of panelParts) {
    if (p) {
      p.position.x -= hingeX;
      doorPanel.add(p);
    }
  }
  doorPanel.position.x = hingeX;
  doorPanel.rotation.y = -Math.PI / 1.6; // Opened wide
  surround.add(doorPanel);
  
  g.add(surround);

  // Tiled hip roof
  const roofH = 2.2 * s;
  const overhang = 0.6 * s;
  const roofRadius = Math.sqrt(Math.pow((W + overhang) / 2, 2) + Math.pow((D + overhang) / 2, 2));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofRadius, roofH, 4), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.4 * s + H + roofH / 2;
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData.noCollision = true;
  g.add(roof);

  // Roof collision (approximate the hip roof with a box)
  const roofProxy = boxCollider(W + overhang, roofH * 0.8, D + overhang);
  roofProxy.position.y = 0.4 * s + H + roofH * 0.4;
  g.add(roofProxy);

  const chimney = createChimney(s, mats);
  chimney.position.set(-W / 4, 0.4 * s + H + roofH * 0.35, -D / 4);
  chimney.traverse((c) => { c.userData.noCollision = true; });
  g.add(chimney);

  // Side windows with shutters + flower pots
  const winW = 0.7 * s;
  const winH = 1.0 * s;
  for (const side of [-1, 1] as const) {
    const win = new THREE.Group();
    win.position.set(side * (W / 2 - t / 2), 0.4 * s + 1.6 * s, 0);
    win.rotation.y = side * Math.PI / 2;
    win.add(createWindowWithGrille(winW, winH, s, mats));
    win.add(createWoodenShutters(winW, winH, s, mats));
    const pot = createFlowerPot(s);
    pot.position.set(0, -winH / 2 - 0.15 * s, 0.1 * s);
    win.add(pot);
    win.traverse((c) => { c.userData.noCollision = true; });
    g.add(win);
  }

  // ── Interior furnishings ──
  const floorY = 0.43 * s;

  // Hearth against the back wall
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.8 * s, 1.5 * s, 0.7 * s), mats.stone);
  hearth.position.set(-W / 4, floorY + 0.75 * s, -D / 2 + t + 0.35 * s);
  hearth.castShadow = true;
  hearth.userData.isCollider = true;
  g.add(hearth);
  const firebox = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.7 * s, 0.2 * s), fm.ember);
  firebox.position.set(-W / 4, floorY + 0.5 * s, -D / 2 + t + 0.72 * s);
  firebox.userData.noCollision = true;
  g.add(firebox);

  // Table + benches
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.2 * s, 0.16 * s, 1.1 * s), mats.wood);
  tableTop.position.set(0.6 * s, floorY + 0.95 * s, 0.5 * s);
  tableTop.castShadow = true;
  tableTop.userData.isCollider = true;
  g.add(tableTop);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.9 * s, 0.14 * s), mats.wood);
    leg.position.set(0.6 * s + lx * 0.95 * s, floorY + 0.47 * s, 0.5 * s + lz * 0.45 * s);
    leg.userData.noCollision = true;
    g.add(leg);
  }
  for (const bz of [-0.85, 0.85]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0 * s, 0.12 * s, 0.35 * s), mats.wood);
    bench.position.set(0.6 * s, floorY + 0.5 * s, 0.5 * s + bz * s);
    bench.castShadow = true;
    bench.userData.noCollision = true;
    g.add(bench);
  }

  // Shelf with jars against the right wall
  for (let i = 0; i < 2; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.06 * s, 2.2 * s), mats.wood);
    shelf.position.set(W / 2 - t - 0.25 * s, floorY + (1.0 + i * 0.8) * s, -1.0 * s);
    shelf.userData.noCollision = true;
    g.add(shelf);
    for (let j = 0; j < 3; j++) {
      const jar = buildAmphora(s * 0.5, fm);
      jar.position.set(W / 2 - t - 0.25 * s, floorY + (1.05 + i * 0.8) * s, -1.8 * s + j * 0.8 * s);
      g.add(jar);
    }
  }

  // A woven rug
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * s, 1.6 * s), new THREE.MeshStandardMaterial({ color: 0x7a2e22, roughness: 1.0 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.6 * s, floorY + 0.015 * s, 0.5 * s);
  rug.userData.noCollision = true;
  g.add(rug);

  // Two amphorae flanking the entrance outside
  for (const sx of [-1, 1]) {
    const jar = buildAmphora(s, fm);
    jar.position.set(sx * (doorW / 2 + 0.5 * s), 0.4 * s, D / 2 + 0.6 * s);
    g.add(jar);
  }

  return g;
}

// ─── Mesh class ────────────────────────────────────────────────────────────────

export class MalakaFarm extends Mesh {
  static readonly type = 'malaka_farm';
  static readonly category = 'building' as const;
  static readonly aliases = ['malaka_olive_farm', 'olive_farm'] as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const s = scale;
    const g = new THREE.Group();
    g.position.copy(pos);

    const mats = getMaterials();
    const fm = getFarmMaterials();
    const seed = ctx.rng ? Math.floor(ctx.rng.next() * 1e9) : Math.abs(Math.floor(pos.x * 73856 + pos.z * 19349));
    const rng = ctx.rng ?? makeLocalRng(seed);

    // ── Farmhouse (back-left of the yard) ──
    const house = buildFarmhouse(s, mats, fm);
    house.position.set(-12 * s, 0, -8 * s);
    house.rotation.y = 0.05;
    g.add(house);

    // Flanking cypresses at the entrance
    for (const sx of [-1, 1]) {
      const cyp = buildCypress(s * (0.9 + 0.1 * rng.next()), fm);
      cyp.position.set(-12 * s + sx * 6.5 * s, 0, -8 * s + 5 * s);
      g.add(cyp);
    }

    // Stone well + hay bales near the house
    const well = buildWell(s, mats, fm);
    well.position.set(-3 * s, 0, -6 * s);
    g.add(well);
    for (let i = 0; i < 3; i++) {
      const bale = buildHayBale(s, fm);
      bale.position.set(-6 * s + i * 1.6 * s, 0, 2 * s);
      bale.rotation.y = rng.nextRange(0, Math.PI);
      g.add(bale);
    }

    // ── Olive grove: rows of olive trees (right of the yard) ──
    const groveX = 9 * s;
    const groveZ = 0;
    const cols = 4;
    const rows = 4;
    const spacing = 4.2 * s;
    const groveD = rows * spacing;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const tree = buildOliveTree(s * rng.nextRange(0.9, 1.15), rng, fm);
        tree.position.set(
          groveX + c * spacing + rng.nextRange(-0.4, 0.4) * s,
          0,
          groveZ - groveD / 2 + spacing / 2 + r * spacing + rng.nextRange(-0.4, 0.4) * s,
        );
        tree.rotation.y = rng.nextRange(0, Math.PI * 2);
        g.add(tree);
      }
    }

    // ── Crop field (front of the yard): tilled plot with furrow ridges + crops ──
    const fieldX = -2 * s;
    const fieldZ = 11 * s;
    const fieldW = 18 * s;
    const fieldD = 9 * s;

    const furrows = 7;
    for (let i = 0; i < furrows; i++) {
      const z = fieldZ - fieldD / 2 + (i + 0.5) * (fieldD / furrows);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(fieldW - 1 * s, 0.18 * s, 0.45 * s), fm.soil);
      ridge.position.set(fieldX, 0.12 * s, z);
      ridge.receiveShadow = true;
      ridge.userData.noCollision = true;
      g.add(ridge);
      // small crop tufts along the ridge
      const tufts = 9;
      for (let j = 0; j < tufts; j++) {
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.18 * s, 0.55 * s, 5), fm.crop);
        tuft.position.set(fieldX - (fieldW - 2 * s) / 2 + j * ((fieldW - 2 * s) / (tufts - 1)), 0.4 * s, z);
        tuft.userData.noCollision = true;
        g.add(tuft);
      }
    }

    // ── Low drystone boundary with a gated entrance at the front ──
    const yardW = 46 * s;
    const yardD = 40 * s;
    const halfW = yardW / 2 - 1 * s;
    const halfD = yardD / 2 - 1 * s;
    const wallH = 0.9 * s;
    const wallT = 0.5 * s;

    const addBoundary = (w: number, d: number, x: number, z: number): void => {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mats.stone);
      seg.position.set(x, wallH / 2, z);
      seg.castShadow = true;
      seg.receiveShadow = true;
      g.add(seg);
      const proxy = boxCollider(w, wallH, d);
      proxy.position.set(x, wallH / 2, z);
      g.add(proxy);
    };
    addBoundary(yardW, wallT, 0, -halfD);          // back
    addBoundary(wallT, yardD, -halfW, 0);          // left
    addBoundary(wallT, yardD, halfW, 0);           // right
    // front wall split for a gate gap
    const gateGap = 4 * s;
    const frontSeg = (yardW - gateGap) / 2;
    addBoundary(frontSeg, wallT, -(gateGap / 2 + frontSeg / 2), halfD);
    addBoundary(frontSeg, wallT, gateGap / 2 + frontSeg / 2, halfD);
    // gate posts
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7 * s, 1.6 * s, 0.7 * s), mats.stone);
      post.position.set(sx * gateGap / 2, 0.8 * s, halfD);
      post.castShadow = true;
      post.userData.isCollider = true;
      g.add(post);
    }

    // Keep stone masonry a constant texel size across every block/surface.
    applyWorldTiling(g, mats.stone);

    return withLOD(g, 220, 460);
  }
}

registerMesh(MalakaFarm);
