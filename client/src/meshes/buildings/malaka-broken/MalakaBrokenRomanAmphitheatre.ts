import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from './MalakaBrokenKit';
import { cylinderCollider, boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

// ─── Deterministic pseudo-random for consistent rubble placement ─────────────
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Sand material for the arena (orchestra) floor ───────────────────────────
let _sandMat: THREE.MeshStandardMaterial | null = null;
function getSandMaterial(): THREE.MeshStandardMaterial {
  if (!_sandMat) {
    _sandMat = new THREE.MeshStandardMaterial({
      color: 0xd4b896,
      roughness: 1.0,
      metalness: 0.0,
    });
    _sandMat.userData.flatColor = 0xc4a87a;
  }
  return _sandMat;
}

// ─── Helper: a stone box with shadow support ─────────────────────────────────
function stoneBox(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ─── Helper: seating-tier wedge built from an annular-sector shape ───────────
function createSeatWedge(
  rIn: number, rOut: number,
  thetaStart: number, thetaEnd: number,
  height: number, mat: THREE.Material,
): THREE.Mesh {
  // Small angular gap to prevent Z-fighting on coplanar side faces of adjacent segments
  const gap = 0.002;
  const tStart = thetaStart + gap;
  const tEnd = thetaEnd - gap;

  const shape = new THREE.Shape();
  // Outer arc first (clockwise from thetaStart to thetaEnd)
  shape.absarc(0, 0, rOut, tStart, tEnd, false);
  // Inner arc (counter-clockwise back from thetaEnd to thetaStart)
  shape.absarc(0, 0, rIn, tEnd, tStart, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Extrude goes along +Z; rotate so it goes along +Y instead
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class MalakaBrokenRomanAmphitheatre extends Mesh {
  static readonly type = 'malaka_broken_roman_amphitheatre';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const stoneMat = mats.stone;
    const sandMat = getSandMaterial();
    const rng = seededRandom(42);

    // ── Dimensions ─────────────────────────────────────────────────────────
    const numSegments = 16;
    const angleStep = (Math.PI * 2) / numSegments;
    const numSteps = 6;          // tiers of seating (cavea)
    const stepW = 1.0 * scale;   // radial width of each tier
    const stepH = 0.55 * scale;  // height per tier
    const innerR = 5.5 * scale;  // arena radius
    const wallW = 1.2 * scale;   // outer wall thickness
    const wallR = innerR + numSteps * stepW;

    // ═══════════════════════════════════════════════════════════════════════
    // 0. ARENA FLOOR (orchestra) — sandy disc
    // ═══════════════════════════════════════════════════════════════════════
    const arenaH = 0.15 * scale;
    const arenaGeo = new THREE.CylinderGeometry(innerR - 0.1 * scale, innerR - 0.1 * scale, arenaH, 36);
    const arena = new THREE.Mesh(arenaGeo, sandMat);
    arena.position.y = arenaH / 2;
    arena.receiveShadow = true;
    arena.userData.noCollision = true;
    g.add(arena);

    // Arena floor collider
    const arenaProxy = cylinderCollider(innerR, arenaH);
    arenaProxy.position.y = arenaH / 2;
    g.add(arenaProxy);

    // ═══════════════════════════════════════════════════════════════════════
    // 1. CAVEA — tiered seating with a broken/ruined pattern
    // ═══════════════════════════════════════════════════════════════════════
    // How many tiers survive in each segment (0 = fully collapsed)
    // Segments 0 and 8 are reserved for vomitoria (tunnels), so they have 0 tiers
    const seatPattern = [0, 5, 4, 2, 0, 1, 3, 6, 0, 5, 3, 0, 0, 1, 4, 5];
    // Whether the outer wall survives in each segment
    const wallPattern = [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1];

    for (let s = 0; s < numSegments; s++) {
      const thetaStart = s * angleStep;
      const thetaEnd = (s + 1) * angleStep;
      const midTheta = (thetaStart + thetaEnd) / 2;

      const stepsToBuild = seatPattern[s % seatPattern.length];
      const hasWall = wallPattern[s % wallPattern.length];
      const isVomitorium = (s === 0 || s === 8);

      // ── Seating tiers ──────────────────────────────────────────────────
      for (let i = 0; i < stepsToBuild; i++) {
        const rIn = innerR + i * stepW;
        const rOut = innerR + (i + 1) * stepW;
        const height = (i + 1) * stepH;

        // For the topmost surviving tier on a broken segment, randomise the
        // height slightly to create an uneven, crumbled edge.
        let tierH = height;
        if (i === stepsToBuild - 1 && stepsToBuild < numSteps) {
          tierH = height * (0.5 + rng() * 0.5);
        }

        const wedge = createSeatWedge(rIn, rOut, thetaStart, thetaEnd, tierH, stoneMat);
        wedge.userData.noCollision = true;
        g.add(wedge);

        // Collider for each tier — box approximation at the midpoint
        const midR = (rIn + rOut) / 2;
        const cx = Math.cos(midTheta) * midR;
        const cz = -Math.sin(midTheta) * midR;
        const arcLen = midR * angleStep;

        const proxy = boxCollider(arcLen, tierH, stepW);
        proxy.position.set(cx, tierH / 2, cz);
        proxy.rotation.y = midTheta + Math.PI / 2;
        g.add(proxy);
      }

      // ── Rubble in collapsed sections ───────────────────────────────────
      if (stepsToBuild <= 2 && !isVomitorium) {
        const rubbleCount = 3 + Math.floor(rng() * 4);
        for (let k = 0; k < rubbleCount; k++) {
          const r = innerR + stepW * 1.5 + rng() * (stepW * (numSteps - 1));
          const t = thetaStart + rng() * angleStep;
          const sizeX = (0.3 + rng() * 0.6) * scale;
          const sizeY = (0.2 + rng() * 0.4) * scale;
          const sizeZ = (0.3 + rng() * 0.5) * scale;
          const block = stoneBox(sizeX, sizeY, sizeZ, stoneMat);
          block.position.set(Math.cos(t) * r, sizeY / 2, -Math.sin(t) * r);
          block.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.3);
          block.userData.noCollision = true;
          g.add(block);

          // Collider only for large rubble pieces (> 0.5 scale)
          if (sizeX > 0.45 * scale && sizeZ > 0.45 * scale) {
            const rProxy = boxCollider(sizeX, sizeY, sizeZ);
            rProxy.position.copy(block.position);
            rProxy.rotation.y = block.rotation.y + Math.PI / 2;
            g.add(rProxy);
          }
        }
      }

      // Also scatter a few isolated blocks near the top of partially
      // surviving sections to show crumbling
      if (stepsToBuild >= 3 && stepsToBuild < numSteps) {
        const looseCount = 1 + Math.floor(rng() * 2);
        for (let k = 0; k < looseCount; k++) {
          const fallR = innerR + (stepsToBuild - 1 + rng()) * stepW;
          const fallT = thetaStart + rng() * angleStep;
          const sz = (0.25 + rng() * 0.35) * scale;
          const block = stoneBox(sz, sz * 0.7, sz, stoneMat);
          const topY = stepsToBuild * stepH;
          block.position.set(Math.cos(fallT) * fallR, topY + sz * 0.35, -Math.sin(fallT) * fallR);
          block.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.5);
          block.userData.noCollision = true;
          g.add(block);
        }
      }

      // ═════════════════════════════════════════════════════════════════════
      // 2. OUTER WALL — arcaded facade with Roman arches and pillars
      // ═════════════════════════════════════════════════════════════════════
      if (hasWall) {
        const wallH = (numSteps + 2) * stepH;  // slightly taller than the cavea top

        // ── Foundation / base slab under the wall ────────────────────────
        const baseH = 0.4 * scale;
        const baseWedge = createSeatWedge(wallR - 0.1 * scale, wallR + wallW + 0.1 * scale, thetaStart, thetaEnd, baseH, stoneMat);
        baseWedge.userData.noCollision = true;
        g.add(baseWedge);

        // ── Pillars (piers) at the edges of the segment ──────────────────
        const pillarW = 0.9 * scale;
        const pillarD = wallW * 1.05;
        const rMid = wallR + wallW / 2;
        const pillarH = wallH - baseH;

        // Prevent duplicate pillars at boundaries by only building the end pillar
        // if the next segment doesn't have a wall to build it.
        const nextHasWall = wallPattern[(s + 1) % wallPattern.length];
        const thetasToBuild = [thetaStart];
        if (!nextHasWall) {
          thetasToBuild.push(thetaEnd);
        }

        for (const theta of thetasToBuild) {
          const px = Math.cos(theta) * rMid;
          const pz = -Math.sin(theta) * rMid;
          const pillar = stoneBox(pillarW, pillarH, pillarD, stoneMat);
          pillar.position.set(px, baseH + pillarH / 2, pz);
          pillar.rotation.y = theta + Math.PI / 2;
          pillar.userData.noCollision = true;
          g.add(pillar);
        }

        // ── Semicircular Roman arch (built from voussoir blocks) ─────────
        const span = 2 * rMid * Math.sin(angleStep / 2) - pillarW;
        const archR = span / 2;
        const archCx = Math.cos(midTheta) * rMid;
        const archCz = -Math.sin(midTheta) * rMid;
        const springY = baseH + pillarH * 0.35; // where the arch springs from

        if (archR > 0.3 * scale) {
          const voussoirCount = 7;
          const voussoirThickness = 0.5 * scale;
          const voussoirDepth = wallW * 0.9;

          for (let v = 0; v < voussoirCount; v++) {
            const isKeystone = v === Math.floor(voussoirCount / 2);
            const a0 = (v / voussoirCount) * Math.PI;
            const a1 = ((v + 1) / voussoirCount) * Math.PI;
            const aMid = (a0 + a1) / 2;
            const blockW = isKeystone ? voussoirThickness * 1.2 : voussoirThickness;
            const blockH = (archR * Math.PI) / voussoirCount + 0.05 * scale;

            const vBlock = stoneBox(blockW, blockH, voussoirDepth, stoneMat);
            // Position along the arch
            const vx = archCx + Math.cos(midTheta + Math.PI / 2) * (-Math.cos(aMid) * (archR + blockW / 2));
            const vy = springY + Math.sin(aMid) * (archR + blockW / 2);
            const vz = archCz - Math.sin(midTheta + Math.PI / 2) * (-Math.cos(aMid) * (archR + blockW / 2));

            vBlock.position.set(vx, vy, vz);
            vBlock.rotation.y = midTheta + Math.PI / 2;
            vBlock.rotation.z = aMid - Math.PI / 2;
            vBlock.userData.noCollision = true;
            g.add(vBlock);
          }
        }

        // ── Lintel / entablature above the arch ──────────────────────────
        const lintelH = 0.5 * scale;
        const lintel = createSeatWedge(wallR, wallR + wallW, thetaStart, thetaEnd, lintelH, stoneMat);
        lintel.position.y = baseH + pillarH - lintelH;
        lintel.userData.noCollision = true;
        g.add(lintel);

        // ── Cornice at the very top ──────────────────────────────────────
        const corniceH = 0.25 * scale;
        const corniceWedge = createSeatWedge(
          wallR - 0.15 * scale, wallR + wallW + 0.2 * scale,
          thetaStart, thetaEnd, corniceH, stoneMat,
        );
        corniceWedge.position.y = wallH; // Place on top of lintel
        corniceWedge.userData.noCollision = true;
        g.add(corniceWedge);

        // ── Wall collision proxy ─────────────────────────────────────────
        const archTopY = springY + archR;

        // Base proxy (ground to baseH) so players can walk through the arch
        const arcLen = rMid * angleStep;
        const baseProxy = boxCollider(arcLen, baseH, wallW);
        baseProxy.position.set(
          Math.cos(midTheta) * rMid,
          baseH / 2,
          -Math.sin(midTheta) * rMid,
        );
        baseProxy.rotation.y = midTheta + Math.PI / 2;
        g.add(baseProxy);

        // Upper wall proxy (above arch to wall top)
        const upperStartY = archTopY;
        const upperH = wallH - upperStartY;
        if (upperH > 0.3 * scale) {
          const arcLen = rMid * angleStep;
          const upperProxy = boxCollider(arcLen, upperH, wallW);
          upperProxy.position.set(
            Math.cos(midTheta) * rMid,
            upperStartY + upperH / 2,
            -Math.sin(midTheta) * rMid,
          );
          upperProxy.rotation.y = midTheta + Math.PI / 2;
          g.add(upperProxy);
        }

        // Pillar colliders
        for (const theta of thetasToBuild) {
          const pProxy = boxCollider(pillarW, pillarH, pillarD);
          pProxy.position.set(
            Math.cos(theta) * rMid,
            baseH + pillarH / 2,
            -Math.sin(theta) * rMid,
          );
          pProxy.rotation.y = theta + Math.PI / 2;
          g.add(pProxy);
        }
      }

      // ═════════════════════════════════════════════════════════════════════
      // 3. COLLAPSED WALL SECTIONS — tumbled wall rubble
      // ═════════════════════════════════════════════════════════════════════
      if (!hasWall) {
        const rubbleCount = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < rubbleCount; k++) {
          const r = wallR + rng() * (wallW * 2) - wallW * 0.5;
          const t = thetaStart + rng() * angleStep;
          const sx = (0.5 + rng() * 1.0) * scale;
          const sy = (0.3 + rng() * 0.5) * scale;
          const sz = (0.4 + rng() * 0.8) * scale;
          const block = stoneBox(sx, sy, sz, stoneMat);
          block.position.set(Math.cos(t) * r, sy / 2, -Math.sin(t) * r);
          block.rotation.set(rng() * 0.3, rng() * Math.PI * 2, rng() * 0.2);
          block.userData.noCollision = true;
          g.add(block);

          if (sx > 0.6 * scale) {
            const rProxy = boxCollider(sx, sy, sz);
            rProxy.position.copy(block.position);
            rProxy.rotation.y = block.rotation.y;
            g.add(rProxy);
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. VOMITORIA (Removed: The empty seating segments combined with the 
    // outer wall arches naturally form beautiful, non-clipping entrances!)
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // 5. PODIUM WALL — low wall separating arena from the first tier
    // ═══════════════════════════════════════════════════════════════════════
    const podiumH = 1.2 * scale;
    const podiumW = 0.35 * scale;
    // Build as a set of segments (skip the vomitoria openings)
    for (let s = 0; s < numSegments; s++) {
      const thetaStart = s * angleStep;
      const thetaEnd = (s + 1) * angleStep;
      const midTheta = (thetaStart + thetaEnd) / 2;

      // Skip vomitoria openings (segments 0 and 8)
      if (s === 0 || s === 8) continue;

      const podiumSegment = createSeatWedge(
        innerR - podiumW, innerR - 0.01 * scale, thetaStart, thetaEnd, podiumH, stoneMat,
      );
      podiumSegment.userData.noCollision = true;
      g.add(podiumSegment);

      // Podium collider
      const podR = innerR - podiumW / 2;
      const arcLen = podR * angleStep;
      const pProxy = boxCollider(arcLen, podiumH, podiumW);
      pProxy.position.set(
        Math.cos(midTheta) * podR,
        podiumH / 2,
        -Math.sin(midTheta) * podR,
      );
      pProxy.rotation.y = midTheta + Math.PI / 2;
      g.add(pProxy);
    }

    // A few podium capstones that have fallen off
    for (let k = 0; k < 4; k++) {
      const t = rng() * Math.PI * 2;
      const r = innerR + (rng() - 0.5) * 2 * scale;
      const sz = (0.3 + rng() * 0.3) * scale;
      const cap = stoneBox(sz, sz * 0.4, sz * 0.8, stoneMat);
      cap.position.set(Math.cos(t) * r, sz * 0.2, -Math.sin(t) * r);
      cap.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.3);
      cap.userData.noCollision = true;
      g.add(cap);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. Apply world-tiling for consistent texture density
    // ═══════════════════════════════════════════════════════════════════════
    applyWorldTiling(g, stoneMat);

    return withLOD(g);
  }
}

registerMesh(MalakaBrokenRomanAmphitheatre);
