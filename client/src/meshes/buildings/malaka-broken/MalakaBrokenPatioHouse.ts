import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createWindowWithGrille,
  createWoodenShutters,
  createFlowerPot,
  createChimney,
  createWoodenBench,
  createWoodenTable,
  createClimbingPlant,
  createRoofTile,
  withLOD,
  MedMaterials,
} from './MalakaBrokenKit';
import { boxCollider, cylinderCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

/**
 * MalakaBrokenPatioHouse — an open Andalusian *casa-patio*.
 *
 * Square two-storey house wrapped around a central open-air patio. Redesigned to
 * be walkable and inviting:
 *   - an arched ENTRANCE gap in the front wall (real collider gap, open door leaves)
 *     leads through a covered arcade straight into the patio,
 *   - the ground-floor arcades are open (passable) so the patio feels airy,
 *   - a stone STAIRCASE climbs from the patio to a walkable upper gallery (loggia)
 *     that rings the courtyard behind a wooden railing,
 *   - a tiled, inward-sloping hip roof crowns the wings; the patio stays open to sky.
 */
export class MalakaBrokenPatioHouse extends Mesh {
  static readonly type = 'malaka_broken_patio_house';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale: S } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // ── Dimensions ───────────────────────────────────────────────────────────
    const outer = 14 * S;
    const half = outer / 2;          // 7S
    const wingDepth = 3 * S;         // depth of each surrounding wing
    const patioHalf = half - wingDepth; // 4S — half-width of the open patio
    const wt = 0.45 * S;             // exterior wall thickness

    const fy = 0.3 * S;              // finished floor / patio level (small step from terrain)
    const groundH = 3.4 * S;
    const upperH = 3.0 * S;
    const wallsH = groundH + upperH; // 6.4S
    const deckY = fy + groundH;      // upper-gallery floor height
    const topY = fy + wallsH;        // wall top
    const zocaloH = 0.95 * S;

    const entranceW = 3.0 * S;
    const entranceH = groundH;       // ground-storey-tall arched passage

    // ── 1. Foundation + walkable floor slab ──────────────────────────────────
    const foundH = fy + 0.6 * S;
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(outer + 0.6 * S, foundH, outer + 0.6 * S),
      mats.stone
    );
    foundation.position.y = fy - foundH / 2;
    foundation.receiveShadow = true;
    foundation.userData.noCollision = true;
    g.add(foundation);

    // One flat collider slab covers the whole footprint so the patio + arcades
    // are walkable and the entrance is a small (≤0.5·S) step up from terrain.
    const floorProxy = boxCollider(outer, 0.4 * S, outer);
    floorProxy.position.y = fy - 0.2 * S;
    g.add(floorProxy);

    // Stone arcade floor + terracotta patio tiles (visual)
    const stoneFloor = new THREE.Mesh(new THREE.PlaneGeometry(outer, outer), mats.stone);
    stoneFloor.rotation.x = -Math.PI / 2;
    stoneFloor.position.y = fy + 0.01 * S;
    stoneFloor.receiveShadow = true;
    stoneFloor.userData.noCollision = true;
    g.add(stoneFloor);

    const patioMat = mats.terracotta.clone();
    if (patioMat.map) { patioMat.map = patioMat.map.clone(); patioMat.map.repeat.set(10, 10); }
    const patioFloor = new THREE.Mesh(new THREE.PlaneGeometry(patioHalf * 2, patioHalf * 2), patioMat);
    patioFloor.rotation.x = -Math.PI / 2;
    patioFloor.position.y = fy + 0.02 * S;
    patioFloor.receiveShadow = true;
    patioFloor.userData.noCollision = true;
    g.add(patioFloor);

    // ── 2. Exterior walls (back, left, right + two front flanks) ──────────────
    const wallTop = fy + wallsH;
    const addExtWall = (cx: number, cz: number, len: number, rotY: number): void => {
      const wg = new THREE.Group();
      wg.position.set(cx, 0, cz);
      wg.rotation.y = rotY;

      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wallsH, wt), mats.stucco);
      wall.position.y = fy + wallsH / 2;
      wall.castShadow = wall.receiveShadow = true;
      wg.add(wall);

      const zocalo = new THREE.Mesh(
        new THREE.BoxGeometry(len + 0.02 * S, zocaloH, wt + 0.06 * S),
        mats.azulejo
      );
      zocalo.position.y = fy + zocaloH / 2;
      wg.add(zocalo);

      for (const cy of [fy + groundH, wallTop - 0.12 * S]) {
        const cornice = new THREE.Mesh(
          new THREE.BoxGeometry(len + 0.12 * S, 0.22 * S, wt + 0.14 * S),
          mats.stone
        );
        cornice.position.y = cy;
        wg.add(cornice);
      }

      // Windows on the outer face — sparse: a couple on the ground, a couple up.
      const groundCount = Math.max(1, Math.round(len / (8 * S)));
      const upperCount = Math.max(1, Math.round(len / (6 * S)));
      const placeRow = (n: number, y: number): void => {
        for (let i = 0; i < n; i++) {
          const lx = (n === 1) ? 0 : (i / (n - 1) - 0.5) * (len - 2.2 * S);
          this.addWindow(wg, lx, y, wt / 2 + 0.06 * S, 0, S, mats);
        }
      };
      placeRow(groundCount, fy + 1.9 * S);
      placeRow(upperCount, deckY + 1.5 * S);

      // Grass tufts + a climbing vine creeping up the whitewash.
      this.addWallGreenery(wg, len, wt / 2 + 0.04 * S, fy, groundH, S, mats);

      wg.userData.noCollision = true;
      g.add(wg);

      const proxy = boxCollider(len, wallsH, wt);
      proxy.position.set(cx, fy + wallsH / 2, cz);
      proxy.rotation.y = rotY;
      g.add(proxy);
    };

    const wallOff = half - wt / 2;
    addExtWall(0, -wallOff, outer, Math.PI);          // back
    addExtWall(-wallOff, 0, outer, -Math.PI / 2);     // left
    addExtWall(wallOff, 0, outer, Math.PI / 2);       // right

    // Front flanks (leave the central entrance open)
    const flankLen = (outer - entranceW) / 2;          // 5.5S
    const flankX = entranceW / 2 + flankLen / 2;       // 4.25S
    addExtWall(-flankX, wallOff, flankLen, 0);
    addExtWall(flankX, wallOff, flankLen, 0);

    // ── 3. Entrance: arch, lintel wall above, open door leaves ────────────────
    const frontZ = wallOff;
    // Solid wall above the entrance arch (upper storey continuous across the front)
    const lintelH = wallsH - entranceH;
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(entranceW + 0.4 * S, lintelH, wt),
      mats.stucco
    );
    lintel.position.set(0, fy + entranceH + lintelH / 2, frontZ);
    lintel.castShadow = true;
    g.add(lintel);
    const lintelProxy = boxCollider(entranceW + 0.4 * S, lintelH, wt);
    lintelProxy.position.set(0, fy + entranceH + lintelH / 2, frontZ);
    g.add(lintelProxy);

    // Stone arch ring framing the opening
    const archRing = new THREE.Mesh(
      new THREE.TorusGeometry(entranceW / 2, 0.22 * S, 10, 24, Math.PI),
      mats.stone
    );
    archRing.position.set(0, fy + entranceH - entranceW / 2, frontZ + wt / 2);
    g.add(archRing);
    for (const sx of [-1, 1]) {
      const jamb = new THREE.Mesh(
        new THREE.BoxGeometry(0.3 * S, entranceH - entranceW / 2, wt + 0.05 * S),
        mats.stone
      );
      jamb.position.set(sx * entranceW / 2, fy + (entranceH - entranceW / 2) / 2, frontZ);
      g.add(jamb);
    }

    // Two studded wooden door leaves, swung open into the arcade
    const leafW = entranceW / 2 - 0.05 * S;
    const leafH = entranceH * 0.92;
    const makeLeaf = (hingeX: number, openAngle: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(hingeX, fy, frontZ - wt / 2);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, 0.08 * S), mats.door);
      leaf.position.set(-Math.sign(hingeX) * leafW / 2, leafH / 2, 0);
      pivot.add(leaf);
      const studMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.4 });
      for (let r = 1; r <= 4; r++) {
        for (let c = 1; c <= 2; c++) {
          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S, 6, 6), studMat);
          stud.position.set(-Math.sign(hingeX) * (c / 3) * leafW, (r / 5) * leafH, -0.05 * S);
          pivot.add(stud);
        }
      }
      pivot.rotation.y = openAngle;
      pivot.userData.noCollision = true;
      pivot.traverse(o => { o.userData.noCollision = true; });
      g.add(pivot);
    };
    makeLeaf(-entranceW / 2, -Math.PI * 0.62);
    makeLeaf(entranceW / 2, Math.PI * 0.62);

    // ── 4. Ground-floor arcade (open arched panels facing the patio) ──────────
    const arcadeSides: Array<{ cx: number; cz: number; rotY: number }> = [
      { cx: 0, cz: patioHalf, rotY: 0 },          // front
      { cx: 0, cz: -patioHalf, rotY: Math.PI },   // back
      { cx: -patioHalf, cz: 0, rotY: -Math.PI / 2 }, // left
      { cx: patioHalf, cz: 0, rotY: Math.PI / 2 },   // right
    ];
    for (const s of arcadeSides) {
      const panel = this.createArcadePanel(patioHalf * 2, groundH, 0.3 * S, 3, mats, S);
      panel.position.set(s.cx, fy, s.cz);
      panel.rotation.y = s.rotY;
      panel.userData.noCollision = true;
      panel.traverse(o => { o.userData.noCollision = true; });
      g.add(panel);
    }

    // ── 5. Upper-gallery walkable deck (ring of slabs over the wings) ──────────
    const deckThick = 0.25 * S;
    const deckMid = (patioHalf + half) / 2; // 5.5S
    // front & back decks span full width (cover corners); side decks fill between
    const addDeck = (cx: number, cz: number, sx: number, sz: number): void => {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(sx, deckThick, sz), mats.terracotta);
      slab.position.set(cx, deckY - deckThick / 2, cz);
      slab.receiveShadow = true;
      slab.userData.noCollision = true;
      g.add(slab);
      const proxy = boxCollider(sx, deckThick, sz);
      proxy.position.set(cx, deckY - deckThick / 2, cz);
      g.add(proxy);
    };
    addDeck(0, deckMid, outer, wingDepth);
    addDeck(0, -deckMid, outer, wingDepth);
    addDeck(deckMid, 0, wingDepth, patioHalf * 2);
    addDeck(-deckMid, 0, wingDepth, patioHalf * 2);

    // Gallery posts + railing along the patio edge of the deck
    const railH = 1.0 * S;
    for (const s of arcadeSides) {
      const rg = new THREE.Group();
      rg.position.set(s.cx, deckY, s.cz);
      rg.rotation.y = s.rotY;

      // wooden posts rising to the roof
      const postN = 4;
      for (let i = 0; i <= postN; i++) {
        const lx = (i / postN - 0.5) * patioHalf * 2;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18 * S, upperH, 0.18 * S), mats.wood);
        post.position.set(lx, upperH / 2, 0);
        rg.add(post);
      }
      const rail = this.createRailing(patioHalf * 2, railH, S, mats);
      rg.add(rail);
      // flower pots on the rail
      for (let i = -2; i <= 2; i++) {
        const pot = createFlowerPot(S * 0.7);
        pot.position.set(i * (patioHalf * 2 / 6), railH, 0);
        rg.add(pot);
      }
      rg.userData.noCollision = true;
      g.add(rg);
    }

    // Railing colliders (stop falling into the patio). Back railing has a GAP
    // where the staircase arrives.
    const stairX = -2.5 * S;
    const stairW = 1.6 * S;
    const addRailColl = (cx: number, cz: number, len: number, rotY: number) => {
      const p = boxCollider(len, railH, 0.15 * S);
      p.position.set(cx, deckY + railH / 2, cz);
      p.rotation.y = rotY;
      g.add(p);
    };
    addRailColl(0, patioHalf, patioHalf * 2, 0);          // front gallery rail
    addRailColl(patioHalf, 0, patioHalf * 2, Math.PI / 2); // right
    addRailColl(-patioHalf, 0, patioHalf * 2, Math.PI / 2); // left
    // back rail split around the stair landing
    const gapL = stairX - stairW / 2, gapR = stairX + stairW / 2;
    const leftSeg = (gapL - (-patioHalf));
    addRailColl((-patioHalf + gapL) / 2, -patioHalf, leftSeg, 0);
    const rightSeg = (patioHalf - gapR);
    addRailColl((gapR + patioHalf) / 2, -patioHalf, rightSeg, 0);

    // ── 6. Staircase: patio → back gallery deck ───────────────────────────────
    // Straight flight against the back wing. 10 steps × 0.34·S rise (< 0.5 step
    // limit) with generous 0.30·S treads, flanked by sloped stone cheek walls.
    const stepN = 10;
    const stairBottomZ = -1.0 * S;
    const stairTopZ = -patioHalf;            // lands flush on the back deck (-4S)
    const stepRise = groundH / stepN;        // 0.34·S
    const tread = (stairBottomZ - stairTopZ) / stepN; // 0.30·S, positive
    for (let i = 0; i < stepN; i++) {
      const h = (i + 1) * stepRise;          // solid riser block up from the floor
      const z = stairBottomZ - (i + 0.5) * tread;
      const step = new THREE.Mesh(new THREE.BoxGeometry(stairW, h, tread), mats.stone);
      step.position.set(stairX, fy + h / 2, z);
      step.castShadow = step.receiveShadow = true;
      step.userData.noCollision = true;
      g.add(step);
      const proxy = boxCollider(stairW, h, tread);
      proxy.position.set(stairX, fy + h / 2, z);
      g.add(proxy);
    }
    // Sloped stone cheek walls (balustrades) on both sides of the flight.
    const runLen = stairBottomZ - stairTopZ;          // 3.0S
    const riseLen = groundH;                          // 3.4S
    const cheekLen = Math.hypot(runLen, riseLen);
    const cheekAng = Math.atan2(riseLen, runLen);
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(
        new THREE.BoxGeometry(0.18 * S, 0.7 * S, cheekLen),
        mats.stone
      );
      // rotate so it climbs toward -Z (the top), centred on the flight mid-line
      cheek.rotation.x = cheekAng;
      cheek.position.set(
        stairX + sx * (stairW / 2 + 0.09 * S),
        fy + riseLen / 2 + 0.2 * S,
        (stairBottomZ + stairTopZ) / 2
      );
      cheek.castShadow = cheek.receiveShadow = true;
      cheek.userData.noCollision = true;
      g.add(cheek);
    }

    // ── 7. Central fountain + patio furniture ─────────────────────────────────
    const fountain = this.createFountain(S, mats);
    fountain.position.y = fy;
    fountain.userData.noCollision = true;
    fountain.traverse(o => { o.userData.noCollision = true; });
    g.add(fountain);
    const fProxy = cylinderCollider(1.0 * S, 1.5 * S);
    fProxy.position.y = fy + 0.75 * S;
    g.add(fProxy);

    const bench = createWoodenBench(S, mats);
    bench.position.set(patioHalf - 0.9 * S, fy, 1.5 * S);
    bench.rotation.y = -Math.PI / 2;
    bench.userData.noCollision = true;
    bench.traverse(o => { o.userData.noCollision = true; });
    g.add(bench);

    const table = createWoodenTable(S, mats);
    table.position.set(patioHalf - 1.7 * S, fy, -1.2 * S);
    table.userData.noCollision = true;
    table.traverse(o => { o.userData.noCollision = true; });
    g.add(table);

    // potted greenery in the patio corners
    for (const [px, pz] of [[-patioHalf + 0.6 * S, patioHalf - 0.6 * S], [patioHalf - 0.6 * S, patioHalf - 0.6 * S]]) {
      const pot = createFlowerPot(S * 1.2);
      pot.position.set(px, fy, pz);
      pot.userData.noCollision = true;
      g.add(pot);
    }
    const climber = createClimbingPlant(patioHalf * 0.6, groundH * 0.8, S, mats);
    climber.position.set(-patioHalf + 0.2 * S, fy, -1.5 * S);
    climber.rotation.y = Math.PI / 2;
    climber.userData.noCollision = true;
    climber.traverse(o => { o.userData.noCollision = true; });
    g.add(climber);

    // ── 8. Pitched tiled roofs over the wings ─────────────────────────────────
    // Each wing gets a single pitch: ridge high at the patio side, eave low and
    // overhanging the outer wall. The eave sits right on the wall top so the
    // roof reads as a proper roof from outside; the patio stays open to sky.
    const overhang = 0.6 * S;
    const ridgeRise = 1.2 * S;
    const slopeLen = Math.hypot(wingDepth, ridgeRise) + overhang;
    const slopeAngle = Math.atan2(ridgeRise, wingDepth);
    // Local +Z faces the outer wall (low eave); -Z faces the patio (high ridge).
    const roofSides: Array<{ cx: number; cz: number; rotY: number; span: number }> = [
      { cx: 0, cz: deckMid, rotY: 0, span: outer + overhang * 2 },
      { cx: 0, cz: -deckMid, rotY: Math.PI, span: outer + overhang * 2 },
      { cx: -deckMid, cz: 0, rotY: -Math.PI / 2, span: patioHalf * 2 },
      { cx: deckMid, cz: 0, rotY: Math.PI / 2, span: patioHalf * 2 },
    ];
    for (const s of roofSides) {
      const rg = new THREE.Group();
      rg.position.set(s.cx, topY, s.cz);
      rg.rotation.y = s.rotY;

      const plane = new THREE.Mesh(new THREE.BoxGeometry(s.span, 0.16 * S, slopeLen), mats.roof);
      plane.rotation.x = slopeAngle;             // +Z end drops to the eave
      plane.position.y = (slopeLen / 2) * Math.sin(slopeAngle); // eave ≈ wall top
      plane.castShadow = plane.receiveShadow = true;
      plane.userData.noCollision = true;
      rg.add(plane);

      // terracotta tile rolls along the low outer eave
      const eaveY = plane.position.y - (slopeLen / 2) * Math.sin(slopeAngle) + 0.12 * S;
      const eaveZ = (slopeLen / 2) * Math.cos(slopeAngle);
      const tileCount = Math.round(s.span / (0.45 * S));
      for (let i = 0; i < tileCount; i++) {
        const tile = createRoofTile(S, mats);
        const lx = (i / (tileCount - 1) - 0.5) * s.span;
        tile.position.set(lx, eaveY, eaveZ);
        tile.rotation.y = Math.PI / 2;
        tile.userData.noCollision = true;
        rg.add(tile);
      }
      rg.userData.noCollision = true;
      g.add(rg);
    }

    const chimney = createChimney(S * 1.3, mats);
    chimney.position.set(outer * 0.25, topY + 1.2 * S, -deckMid);
    chimney.userData.noCollision = true;
    chimney.traverse(o => { o.userData.noCollision = true; });
    g.add(chimney);

    // ── Tiling + LOD ─────────────────────────────────────────────────────────
    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.stucco);
    applyWorldTiling(g, mats.roof);
    applyWorldTiling(g, mats.azulejo);
    applyWorldTiling(g, mats.door, 2.0);
    applyWorldTiling(g, mats.terracotta, 2.0);
    return withLOD(g);
  }

  // ───────────────────────────────────────────────────────────────────────────

  private addWindow(
    parent: THREE.Group, x: number, y: number, z: number,
    rotY: number, scale: number, mats: MedMaterials,
  ): void {
    const winW = 0.8 * scale;
    const winH = 1.3 * scale;
    const wg = new THREE.Group();

    const win = createWindowWithGrille(winW, winH, scale, mats);
    wg.add(win);
    const shutters = createWoodenShutters(winW, winH, scale, mats);
    shutters.position.z = 0.1 * scale;
    wg.add(shutters);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffaa44, emissive: 0xffaa44, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.3,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(winW * 0.9, winH * 0.9), glowMat);
    glow.position.z = -0.05 * scale;
    wg.add(glow);

    wg.position.set(x, y, z);
    wg.rotation.y = rotY;
    wg.userData.noCollision = true;
    parent.add(wg);
  }

  /** Grass tufts along a wall base + climbing vines up the whitewash. */
  private addWallGreenery(
    parent: THREE.Group, len: number, faceZ: number,
    baseY: number, climbH: number, scale: number, mats: MedMaterials,
  ): void {
    const count = Math.max(3, Math.round(len / (1.3 * scale)));
    for (let i = 0; i < count; i++) {
      const lx = (count === 1) ? 0 : (i / (count - 1) - 0.5) * (len - 0.4 * scale);
      const tuft = new THREE.Group();
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05 * scale, 0.35 * scale, 4), mats.foliage);
        blade.position.set((Math.random() - 0.5) * 0.25 * scale, 0.17 * scale, (Math.random() - 0.5) * 0.1 * scale);
        blade.rotation.z = (Math.random() - 0.5) * 0.5;
        tuft.add(blade);
      }
      tuft.position.set(lx, baseY, faceZ + 0.05 * scale);
      tuft.userData.noCollision = true;
      parent.add(tuft);
    }
    // a couple of climbing vines scaling the wall
    for (const vx of [-len * 0.3, len * 0.32]) {
      const vine = createClimbingPlant(0.8 * scale, climbH * 0.9, scale, mats);
      vine.position.set(vx, baseY, faceZ);
      vine.userData.noCollision = true;
      vine.traverse(o => { o.userData.noCollision = true; });
      parent.add(vine);
    }
  }

  /** A thin stucco arcade wall with N semicircular-arched openings. */
  private createArcadePanel(
    length: number, height: number, thick: number,
    openings: number, mats: MedMaterials, scale: number,
  ): THREE.Group {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-length / 2, 0);
    shape.lineTo(-length / 2, height);
    shape.lineTo(length / 2, height);
    shape.lineTo(length / 2, 0);
    shape.closePath();

    const spacing = length / openings;
    const openW = spacing * 0.62;
    const openH = height * 0.82;
    const r = openW / 2;
    for (let i = 0; i < openings; i++) {
      const cx = -length / 2 + (i + 0.5) * spacing;
      const hole = new THREE.Path();
      hole.moveTo(cx - r, 0);
      hole.lineTo(cx - r, openH - r);
      hole.absarc(cx, openH - r, r, Math.PI, 0, true);
      hole.lineTo(cx + r, 0);
      hole.closePath();
      shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geo.translate(0, 0, -thick / 2);
    const panel = new THREE.Mesh(geo, mats.stucco);
    panel.castShadow = panel.receiveShadow = true;
    g.add(panel);

    // stone plinth + capitals hint
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.5 * scale, thick + 0.06 * scale),
      mats.stone
    );
    plinth.position.y = 0.25 * scale;
    g.add(plinth);
    return g;
  }

  private createRailing(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
    const g = new THREE.Group();
    const railT = 0.08 * scale;
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, railT, railT), mats.wood);
    top.position.y = height;
    g.add(top);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(width, railT, railT), mats.wood);
    bottom.position.y = railT / 2;
    g.add(bottom);
    const bCount = Math.floor(width / (0.3 * scale));
    const bGeo = new THREE.BoxGeometry(0.04 * scale, height, 0.04 * scale);
    for (let i = 0; i <= bCount; i++) {
      const x = (i / bCount - 0.5) * width;
      const b = new THREE.Mesh(bGeo, mats.wood);
      b.position.set(x, height / 2, 0);
      g.add(b);
    }
    return g;
  }

  private createFountain(scale: number, mats: MedMaterials): THREE.Group {
    const g = new THREE.Group();
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2aa9d8, metalness: 0.1, roughness: 0.05,
      transparent: true, opacity: 0.7, emissive: 0x10506e, emissiveIntensity: 0.4,
    });

    // Solid pedestal basin. Walls rise to 0.5; the pool water sits recessed at
    // 0.4 so it never goes coplanar with the rim (no z-fighting / clipping).
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05 * scale, 1.2 * scale, 0.5 * scale, 16),
      mats.stone
    );
    basin.position.y = 0.25 * scale;
    basin.castShadow = basin.receiveShadow = true;
    g.add(basin);
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92 * scale, 0.92 * scale, 0.04 * scale, 24),
      waterMat
    );
    pool.position.y = 0.4 * scale; // 0.1 below the 0.5 rim
    g.add(pool);

    // Central column + upper bowl, each water tier kept clearly inside its rim.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * scale, 0.2 * scale, 1.0 * scale, 10), mats.stone);
    stem.position.y = 0.9 * scale;
    g.add(stem);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * scale, 0.22 * scale, 0.22 * scale, 14), mats.stone);
    bowl.position.y = 1.42 * scale;
    g.add(bowl);
    const topPool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36 * scale, 0.36 * scale, 0.04 * scale, 16),
      waterMat
    );
    topPool.position.y = 1.5 * scale; // below bowl rim at ~1.53
    g.add(topPool);
    return g;
  }
}

registerMesh(MalakaBrokenPatioHouse);
