import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createHorseshoeArch,
  createWindowWithGrille,
  createPergola,
  createFlowerPot,
  createWoodenBench,
  createWoodenTable,
  createClimbingPlant,
  withLOD,
} from './MalakaBrokenKit';
import { boxCollider, cylinderCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

/**
 * Mediterranean hip roof from a single BufferGeometry. World-unit UVs keep the
 * roof texture at a constant scale regardless of footprint size.
 */
function createHipRoof(width: number, depth: number, height: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const ridgeLen = Math.max(0.1, Math.abs(width - depth));
  const isWide = width > depth;
  const rx = isWide ? ridgeLen / 2 : 0;
  const rz = isWide ? 0 : ridgeLen / 2;

  const vertices = new Float32Array([
    -width / 2, 0, -depth / 2,
     width / 2, 0, -depth / 2,
     width / 2, 0,  depth / 2,
    -width / 2, 0,  depth / 2,
    -rx, height, -rz,
     rx, height,  rz,
  ]);
  const indices = [0, 1, 5, 0, 5, 4, 1, 2, 5, 2, 3, 4, 2, 4, 5, 3, 0, 4];
  const uvs = new Float32Array([
    -width / 2, -depth / 2,
     width / 2, -depth / 2,
     width / 2,  depth / 2,
    -width / 2,  depth / 2,
    -rx, -rz,
     rx,  rz,
  ]);
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.userData.noCollision = true;
  return mesh;
}

/**
 * Monopitch (lean-to) terracotta roof that rings the courtyard: the outer eave
 * sits high, the inner eave low, so rain sheds away from the patio which stays
 * open to the sky. Returned as a flat slab in local space (long axis = X, slopes
 * along +Z = outward); the caller rotates it onto each side of the square.
 * Slopes down toward the outside (inner ridge high, outer eave low) so the four
 * sides overlap into a clean cloister-style hip skirt around the open patio.
 */
function createWingRoof(length: number, roofDepth: number, rise: number, slabT: number, mat: THREE.Material): THREE.Mesh {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(length, slabT, roofDepth), mat);
  // Positive tilt about X drops the +Z (outer) eave and lifts the -Z (inner) ridge.
  slab.rotation.x = Math.atan2(rise, roofDepth);
  slab.castShadow = true;
  slab.userData.noCollision = true;
  return slab;
}

export class MalakaBrokenCortijo extends Mesh {
  static readonly type = 'malaka_broken_cortijo';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const mats = getMaterials();
    // Roof must show both faces (we view the underside from inside the patio).
    const roofMat = mats.roof.clone();
    roofMat.side = THREE.DoubleSide;

    // ── Dimensions ────────────────────────────────────────────────────────────
    const outer = 18 * scale;           // outer footprint (square)
    const half = outer / 2;
    const wallT = 1.3 * scale;          // perimeter wall thickness
    const wallH = 5 * scale;            // wing wall height
    const inner = outer - wallT * 2;    // span of the side walls between front/back
    const doorGap = 3.2 * scale;        // entrance opening width (player capsule ø ≈ 0.7)
    const openH = 3.0 * scale;          // entrance opening height
    const zocaloH = 1.0 * scale;        // visible stone skirt
    const zocSkirt = zocaloH + 0.6 * scale; // extends below grade so it won't float on slopes

    const frontZ = half - wallT / 2;    // centre-line of front/back walls
    const sideX = half - wallT / 2;     // centre-line of left/right walls

    // ── Wall builder: stone zócalo + whitewashed wall + box collider ───────────
    const addWall = (cx: number, cz: number, w: number, d: number): void => {
      const zoc = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04 * scale, zocSkirt, d + 0.04 * scale), mats.stone);
      zoc.position.set(cx, zocaloH - zocSkirt / 2, cz);
      zoc.receiveShadow = true;
      zoc.userData.noCollision = true;
      g.add(zoc);

      const wallBodyH = wallH - zocaloH;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallBodyH, d), mats.stucco);
      wall.position.set(cx, zocaloH + wallBodyH / 2, cz);
      wall.castShadow = wall.receiveShadow = true;
      wall.userData.noCollision = true;
      g.add(wall);

      const proxy = boxCollider(w, wallH, d);
      proxy.position.set(cx, wallH / 2, cz);
      g.add(proxy);
    };

    // Back + two sides are solid; the front is split to leave the entrance gap.
    addWall(0, -frontZ, outer, wallT);                 // back
    addWall(-sideX, 0, wallT, inner);                  // left
    addWall(sideX, 0, wallT, inner);                   // right
    const segW = (outer - doorGap) / 2;
    addWall(-(doorGap / 2 + segW / 2), frontZ, segW, wallT); // front-left
    addWall(doorGap / 2 + segW / 2, frontZ, segW, wallT);    // front-right

    // ── Entrance (zaguán): stone arch + spandrel + open wooden door leaves ─────
    // The collider gap left above is the actual walkable doorway.
    const archRadius = doorGap / 2;
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(archRadius + 0.18 * scale, archRadius, wallT + 0.08 * scale, 18, 1, false, 0, Math.PI),
      mats.stone,
    );
    arch.rotation.x = Math.PI / 2;
    arch.position.set(0, openH, frontZ);
    arch.userData.noCollision = true;
    g.add(arch);

    // Stucco tympanum + spandrel filling the wall above the opening.
    const apex = openH + archRadius;
    if (wallH > apex) {
      const spandrel = new THREE.Mesh(new THREE.BoxGeometry(doorGap + 0.36 * scale, wallH - apex, wallT), mats.stucco);
      spandrel.position.set(0, (apex + wallH) / 2, frontZ);
      spandrel.userData.noCollision = true;
      g.add(spandrel);
    }
    const tympanum = new THREE.Mesh(
      new THREE.CircleGeometry(archRadius, 18, 0, Math.PI),
      mats.stucco,
    );
    tympanum.position.set(0, openH, frontZ - wallT / 2 - 0.01 * scale);
    tympanum.rotation.y = Math.PI;
    tympanum.userData.noCollision = true;
    g.add(tympanum);

    // Two wooden door leaves, swung open against the inner wall face.
    const leafW = doorGap / 2;
    const leafGeo = new THREE.BoxGeometry(leafW, openH - 0.1 * scale, 0.1 * scale);
    const innerZ = half - wallT;
    for (const dir of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(dir * archRadius, (openH - 0.1 * scale) / 2, innerZ);
      hinge.rotation.y = dir * (Math.PI / 2 - 0.25); // folded ~80° open into the patio
      const leaf = new THREE.Mesh(leafGeo, mats.door);
      leaf.position.x = -dir * leafW / 2; // pivot on the hinge edge
      leaf.userData.noCollision = true;
      hinge.add(leaf);
      hinge.userData.noCollision = true;
      g.add(hinge);
    }

    // ── Patio floor (terracotta tiles, walkable) ───────────────────────────────
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(inner, inner), mats.terracotta);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.06 * scale;
    floor.receiveShadow = true;
    floor.userData.noCollision = true;
    g.add(floor);

    // ── Central fountain (decorative, solid core) ──────────────────────────────
    const fBase = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * scale, 1.6 * scale, 0.5 * scale, 16), mats.stone);
    fBase.position.y = 0.25 * scale;
    fBase.userData.noCollision = true;
    g.add(fBase);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3a7d8c, metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.85,
    });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * scale, 1.2 * scale, 0.1 * scale, 24), waterMat);
    water.position.y = 0.52 * scale;
    water.userData.noCollision = true;
    g.add(water);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, 1.0 * scale, 10), mats.stone);
    stem.position.y = 1.0 * scale;
    stem.userData.noCollision = true;
    g.add(stem);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.2 * scale, 0.2 * scale, 12), mats.stone);
    bowl.position.y = 1.5 * scale;
    bowl.userData.noCollision = true;
    g.add(bowl);
    const fCol = cylinderCollider(1.5 * scale, 1.6 * scale, 12);
    fCol.position.y = 0.8 * scale;
    g.add(fCol);

    // ── Interior portico: a row of open whitewashed arches along the back wall ─
    // Open arches (piers + arch ring, no door panel) so it reads as an arcade.
    const porticoZ = -frontZ + wallT / 2 + 0.6 * scale;
    for (let x = -2; x <= 2; x++) {
      const a = createHorseshoeArch(1.4 * scale, 2.6 * scale, 0.3 * scale, mats);
      a.traverse((c) => { if (c instanceof THREE.Mesh && c.material === mats.stone) c.material = mats.stucco; });
      a.traverse((c) => { c.userData.noCollision = true; });
      a.position.set(x * 2.6 * scale, 0, porticoZ);
      a.userData.noCollision = true;
      g.add(a);
    }

    // ── Sloped terracotta roof ringing the courtyard (cloister hip skirt) ─────
    // All four slabs run the full footprint length so their corners overlap into
    // a continuous hip — no gaps, no floating tiles. Each slopes down to the
    // outside; the inner ridge sits just above the wall top.
    const overhang = 1.0 * scale;
    const roofDepth = wallT + overhang * 2;
    const roofRise = 1.3 * scale;
    const slabT = 0.22 * scale;
    const roofLen = outer + overhang * 2;
    const sides: { rotY: number; cx: number; cz: number }[] = [
      { rotY: 0, cx: 0, cz: frontZ },          // front (+Z)
      { rotY: Math.PI, cx: 0, cz: -frontZ },   // back (-Z)
      { rotY: -Math.PI / 2, cx: sideX, cz: 0 },// right (+X)
      { rotY: Math.PI / 2, cx: -sideX, cz: 0 },// left (-X)
    ];
    for (const s of sides) {
      const wrap = new THREE.Group();
      wrap.position.set(s.cx, wallH, s.cz);
      wrap.rotation.y = s.rotY;
      wrap.add(createWingRoof(roofLen, roofDepth, roofRise, slabT, roofMat));
      g.add(wrap);
    }

    // ── Corner tower (torre) at the back-left for silhouette ──────────────────
    const towerSize = 4.0 * scale;
    const towerH = 8.5 * scale;
    const tcx = -sideX + towerSize / 2 - wallT / 2;
    const tcz = -frontZ + towerSize / 2 - wallT / 2;
    const tZoc = new THREE.Mesh(new THREE.BoxGeometry(towerSize, zocSkirt, towerSize), mats.stone);
    tZoc.position.set(tcx, zocaloH - zocSkirt / 2, tcz);
    tZoc.userData.noCollision = true;
    g.add(tZoc);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerSize - 0.06 * scale, towerH - zocaloH, towerSize - 0.06 * scale), mats.stucco);
    tower.position.set(tcx, zocaloH + (towerH - zocaloH) / 2, tcz);
    tower.castShadow = true;
    tower.userData.noCollision = true;
    g.add(tower);
    const tProxy = boxCollider(towerSize, towerH, towerSize);
    tProxy.position.set(tcx, towerH / 2, tcz);
    g.add(tProxy);
    const tRoof = createHipRoof(towerSize + 0.8 * scale, towerSize + 0.8 * scale, 2.2 * scale, roofMat);
    tRoof.position.set(tcx, towerH - 0.05 * scale, tcz);
    g.add(tRoof);

    // ── Exterior windows with iron grilles ────────────────────────────────────
    const winY = 2.6 * scale;
    const placeWindow = (x: number, z: number, rotY: number): void => {
      const w = createWindowWithGrille(0.8 * scale, 1.2 * scale, scale, mats);
      w.position.set(x, winY, z);
      w.rotation.y = rotY;
      w.userData.noCollision = true;
      g.add(w);
    };
    placeWindow(-4.5 * scale, frontZ + wallT / 2 + 0.03 * scale, 0);
    placeWindow(4.5 * scale, frontZ + wallT / 2 + 0.03 * scale, 0);
    placeWindow(sideX + wallT / 2 + 0.03 * scale, 3.5 * scale, Math.PI / 2);
    placeWindow(sideX + wallT / 2 + 0.03 * scale, -3.5 * scale, Math.PI / 2);
    placeWindow(-(sideX + wallT / 2 + 0.03 * scale), 3.5 * scale, -Math.PI / 2);

    // ── Patio furnishings: pergola, table+benches, pots, climbing plants ──────
    const pergola = createPergola(5 * scale, 4 * scale, scale, mats);
    pergola.position.set(inner / 2 - 3 * scale, 0, inner / 2 - 3 * scale);
    pergola.traverse((c) => { c.userData.noCollision = true; });
    pergola.userData.noCollision = true;
    g.add(pergola);

    const table = createWoodenTable(scale * 1.2, mats);
    table.position.set(-inner / 2 + 3.5 * scale, 0.06 * scale, inner / 2 - 3.5 * scale);
    table.traverse((c) => { c.userData.noCollision = true; });
    g.add(table);
    for (const dz of [-1.2, 1.2]) {
      const bench = createWoodenBench(scale, mats);
      bench.position.set(-inner / 2 + 3.5 * scale, 0.06 * scale, inner / 2 - 3.5 * scale + dz * scale);
      bench.rotation.y = dz > 0 ? Math.PI : 0;
      bench.traverse((c) => { c.userData.noCollision = true; });
      g.add(bench);
    }

    // Flower pots ringing the fountain.
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const pot = createFlowerPot(scale * 1.4);
      pot.position.set(Math.cos(a) * 2.6 * scale, 0.06 * scale, Math.sin(a) * 2.6 * scale);
      pot.userData.noCollision = true;
      g.add(pot);
    }

    // Climbing plants on two interior wall faces.
    const vineL = createClimbingPlant(inner * 0.7, wallH * 0.8, scale, mats);
    vineL.position.set(-sideX + wallT / 2 + 0.05 * scale, 0, 0);
    vineL.rotation.y = Math.PI / 2;
    vineL.traverse((c) => { c.userData.noCollision = true; });
    g.add(vineL);

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.terracotta);
    applyWorldTiling(g, roofMat);
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenCortijo);
