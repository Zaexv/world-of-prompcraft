import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createDoor, createRoofTile, withLOD, MedMaterials } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

/** A stone box whose masonry tiles at a constant world scale (no stretching). */
function stoneBox(mats: MedMaterials, w: number, h: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.stone);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createStoneCross(scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const t = 0.12 * scale;
  const v = new THREE.Mesh(new THREE.BoxGeometry(t, 1.2 * scale, t), mats.stone);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, t, t), mats.stone);
  h.position.y = 0.2 * scale;
  // Nudge slightly in Z to avoid coplanar faces with the vertical bar
  h.position.z = 0.002 * scale;
  g.add(v, h);
  v.castShadow = h.castShadow = true;
  g.userData.noCollision = true;
  g.traverse(c => { c.userData.noCollision = true; });
  return g;
}

/**
 * Creates a realistic rectangular glass window.
 */
function createRectangularGlassWindow(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
    const group = new THREE.Group();
    
    // 1. Stone Frame (Rectangular)
    const frameT = 0.4 * scale;
    const frame = stoneBox(mats, width + frameT, height + frameT / 2, frameT);
    frame.position.y = (height + frameT / 4) / 2;
    group.add(frame);

    // 2. Glass Pane (Using shared material)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1 * scale), mats.glass);
    glass.position.y = height / 2;
    glass.position.z = 0.05 * scale;
    group.add(glass);

    // 3. Stone Tracery (Horizontal and Vertical bars)
    const mullionV = stoneBox(mats, 0.12 * scale, height, 0.15 * scale);
    mullionV.position.set(0, height/2, 0.1 * scale);
    group.add(mullionV);

    const mullionH = stoneBox(mats, width, 0.12 * scale, 0.15 * scale);
    // Nudge slightly in Z to avoid coplanar faces with vertical mullion
    mullionH.position.set(0, height/2, 0.102 * scale);
    group.add(mullionH);

    group.userData.noCollision = true;
    group.traverse(c => { c.userData.noCollision = true; });
    return group;
}

export class MalakaBrokenChurch extends Mesh {
  static readonly type = 'malaka_broken_church';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // Helper for Corbel Tables
    const addCorbels = (parent: THREE.Group, width: number, length: number, height: number, spacing: number) => {
        const corbelG = new THREE.Group();
        const countX = Math.floor(width / spacing);
        const countZ = Math.floor(length / spacing);
        for (let i = 0; i <= countX; i++) {
            const x = -width/2 + i * spacing;
            for (const side of [-1, 1]) {
                const c = stoneBox(mats, 0.2 * scale, 0.3 * scale, 0.3 * scale);
                c.position.set(x, height - 0.2 * scale, side * (length/2 + 0.1 * scale));
                corbelG.add(c);
            }
        }
        for (let i = 0; i <= countZ; i++) {
            const z = -length/2 + i * spacing;
            for (const side of [-1, 1]) {
                const c = stoneBox(mats, 0.3 * scale, 0.3 * scale, 0.2 * scale);
                c.position.set(side * (width/2 + 0.1 * scale), height - 0.2 * scale, z);
                corbelG.add(c);
            }
        }
        corbelG.userData.noCollision = true;
        corbelG.traverse(c => { c.userData.noCollision = true; });
        parent.add(corbelG);
    };
    
    // 1. DIMENSIONS
    const naveW = 12 * scale;
    const naveD = 24 * scale;
    const naveH = 13 * scale;
    const transeptW = 22 * scale;
    const transeptD = 9 * scale;
    const transeptZ = -2 * scale;
    const facadeT = 1.8 * scale;
    const apseR = naveW / 2;
    const baseH = 1.2 * scale;

    // Plinth
    const frontEdgeZ = naveD / 2 + facadeT;
    const backEdgeZ = -naveD / 2 - apseR - 1 * scale;
    const plinthD = frontEdgeZ - backEdgeZ;
    const plinthZ = (frontEdgeZ + backEdgeZ) / 2;

    // Skirt the plinth below grade (top stays at baseH) so it doesn't float on slopes.
    const plinthHeight = baseH + 0.4 * scale;
    const plinth = stoneBox(mats, transeptW + 4 * scale, plinthHeight, plinthD);
    plinth.position.set(0, baseH - plinthHeight / 2, plinthZ);
    plinth.userData.noCollision = true; // Covered by baseColl proxy
    g.add(plinth);

    // 2. MAIN BODIES
    const createBody = (w: number, h: number, d: number) => {
      const group = new THREE.Group();
      // Overlap the base so the bottom face is buried inside it (no coplanar seam -> no z-fighting).
      const sink = 0.3 * scale;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h + sink, d), mats.stucco);
      body.position.y = (h + sink) / 2 - sink;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      // Corner Quoins
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          for (let y = 0.3 * scale; y < h; y += 0.8 * scale) {
            const quoin = stoneBox(mats, 0.6 * scale, 0.4 * scale, 0.6 * scale);
            quoin.position.set(sx * (w / 2), y, sz * (d / 2));
            group.add(quoin);
          }
        }
      }
      group.userData.noCollision = true;
      group.traverse(c => { c.userData.noCollision = true; });
      return group;
    };

    const naveBody = createBody(naveW, naveH, naveD);
    naveBody.position.y = baseH;
    addCorbels(naveBody, naveW, naveD, naveH, 1.5 * scale);
    g.add(naveBody);

    const transBody = createBody(transeptW, naveH, transeptD);
    transBody.position.set(0, baseH, transeptZ);
    addCorbels(transBody, transeptW, transeptD, naveH, 1.5 * scale);
    
    // Large Rectangular Windows for Transept Ends
    for (const side of [-1, 1]) {
        const win = createRectangularGlassWindow(4 * scale, 8 * scale, scale, mats);
        win.position.set(side * (transeptW / 2), naveH * 0.15, 0);
        win.rotation.y = side * Math.PI / 2;
        transBody.add(win);
    }
    g.add(transBody);

    // 3. FRONT FACADE
    const facadeH = naveH + 6 * scale;
    const facadeSink = 0.3 * scale;
    const facadeBody = new THREE.Mesh(new THREE.BoxGeometry(naveW + 3.5 * scale, facadeH + facadeSink, facadeT), mats.stucco);
    facadeBody.position.set(0, baseH + facadeH / 2 - facadeSink / 2, naveD / 2 + facadeT / 2 - 0.1 * scale);
    facadeBody.castShadow = true;
    facadeBody.userData.noCollision = true;
    g.add(facadeBody);

    const portalG = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const pw = (6.5 - i * 0.7) * scale;
      const ph = (8.5 - i * 0.6) * scale;
      const layer = stoneBox(mats, pw, ph, 0.4 * scale);
      layer.position.set(0, ph / 2, i * 0.45 * scale);
      portalG.add(layer);
      
      if (i === 4) {
          const tym = new THREE.Mesh(new THREE.CylinderGeometry(pw/2, pw/2, 0.15 * scale, 16, 1, false, 0, Math.PI), mats.stone);
          tym.rotation.x = Math.PI / 2;
          tym.position.y = ph - pw/2;
          tym.position.z = 0.2 * scale;
          portalG.add(tym);
      }
    }
    
    // Multi-tiered Columns
    const createOrnateColumn = (sx: number, z: number, h: number) => {
        const cg = new THREE.Group();
        const base = stoneBox(mats, 0.6 * scale, 0.5 * scale, 0.6 * scale);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.3 * scale, h, 8), mats.stone);
        shaft.position.y = h/2 + 0.25 * scale;
        const capital = stoneBox(mats, 0.7 * scale, 0.4 * scale, 0.7 * scale);
        capital.position.y = h + 0.45 * scale;
        cg.add(base, shaft, capital);
        cg.position.set(sx, 0, z);
        return cg;
    };
    portalG.add(createOrnateColumn(-3.2 * scale, 0.5 * scale, 6.5 * scale));
    portalG.add(createOrnateColumn(3.2 * scale, 0.5 * scale, 6.5 * scale));

    const entranceDoor = createDoor(2.4 * scale, 4.8 * scale, 0.4 * scale, mats);
    entranceDoor.position.set(0, 0, 1.8 * scale);
    portalG.add(entranceDoor);
    
    // Sacred Niches
    for (const sx of [-1, 1]) {
        const nicheG = new THREE.Group();
        const frame = stoneBox(mats, 1.1 * scale, 2.4 * scale, 0.6 * scale);
        nicheG.add(frame);
        const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 1.4 * scale, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        statue.position.set(0, 0, 0.25 * scale);
        nicheG.add(statue);
        nicheG.position.set(sx * 4.2 * scale, 4.0 * scale, 0.2 * scale);
        portalG.add(nicheG);
    }

    portalG.position.set(0, baseH, naveD / 2 + facadeT - 0.08 * scale);
    portalG.userData.noCollision = true;
    portalG.traverse(c => { c.userData.noCollision = true; });
    g.add(portalG);

    // Rose Window
    const roseG = new THREE.Group();
    const roseR = 2.4 * scale;
    const roseFrame = new THREE.Mesh(new THREE.TorusGeometry(roseR, 0.4 * scale, 16, 48), mats.stone);
    const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(roseR, 32), mats.glass);
    
    // LAYERED NUDGES to avoid internal Z-fighting
    roseGlass.position.z = -0.02 * scale;
    roseFrame.position.z = 0.02 * scale;
    roseG.add(roseFrame, roseGlass);
    
    // Hub (Solid Cylinder) to hide the center spoke intersection
    const roseCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * scale, 0.7 * scale, 0.3 * scale, 12), mats.stone);
    roseCenter.rotation.x = Math.PI / 2;
    roseCenter.position.z = 0.1 * scale;
    roseG.add(roseCenter);
    
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = stoneBox(mats, 0.12 * scale, roseR * 1.9, 0.25 * scale);
        spoke.rotation.z = a;
        // Alternating Nudges to avoid Z-fighting at the center where all meet
        spoke.position.z = (0.05 + (i % 2 === 0 ? 0.005 : -0.005)) * scale;
        roseG.add(spoke);
    }
    roseG.position.set(0, baseH + naveH + 2.0 * scale, naveD / 2 + facadeT + 0.15 * scale);
    roseG.userData.noCollision = true;
    roseG.traverse(c => { c.userData.noCollision = true; });
    g.add(roseG);

    // Facade Cross
    const fCross = createStoneCross(scale, mats);
    fCross.position.set(0, baseH + facadeH, naveD / 2 + facadeT / 2);
    g.add(fCross);

    // 4. BELL TOWER (Campanario)
    const towerG = new THREE.Group();
    const tw = 5.2 * scale;
    const th1 = 20 * scale;
    const th2 = 9 * scale;
    // Sink tower into plinth
    const towerSink = 0.4 * scale;
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(tw, th1 + towerSink, tw), mats.stone);
    towerBody.position.y = (th1 + towerSink) / 2 - towerSink;
    towerBody.castShadow = towerBody.receiveShadow = true;
    towerG.add(towerBody);

    const belfry = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.8 * scale, th2, tw - 0.8 * scale), mats.stucco);
    belfry.position.y = th1 + th2 / 2;
    towerG.add(belfry);

    const bellMat = new THREE.MeshStandardMaterial({ color: 0xaa9933, metalness: 1.0, roughness: 0.1 });
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        const bW = 1.8 * scale;
        const bH = 4.5 * scale;
        const bWinG = new THREE.Group();
        const bFr = stoneBox(mats, bW, bH, 0.8 * scale);
        bWinG.add(bFr);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 1.0 * scale, 16), bellMat);
        bell.position.set(0, -0.2 * scale, 0);
        bWinG.add(bell);
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.9, 0.3 * scale, 0.3 * scale), mats.wood);
        yoke.position.y = 0.8 * scale;
        bWinG.add(yoke);
        bWinG.position.set(Math.sin(angle) * (tw/2), th1 + 4.5 * scale, Math.cos(angle) * (tw/2));
        bWinG.rotation.y = angle;
        towerG.add(bWinG);
    }

    const spire = new THREE.Mesh(new THREE.ConeGeometry((tw - 0.8 * scale) * 0.9, 7 * scale, 4), mats.roof);
    spire.position.set(0, th1 + th2 + 3 * scale, 0);
    spire.rotation.y = Math.PI / 4;
    towerG.add(spire);

    const tCross = createStoneCross(scale * 0.9, mats);
    tCross.position.y = th1 + th2 + 6.8 * scale; 
    towerG.add(tCross);

    towerG.position.set(-naveW / 2 - tw / 2 + 0.2 * scale, baseH, naveD / 2 - tw / 2 + 0.5 * scale);
    towerG.userData.noCollision = true;
    towerG.traverse(c => { c.userData.noCollision = true; });
    g.add(towerG);

    // 5. CROSSING DOME
    const domeG = new THREE.Group();
    const drumR = 5.8 * scale;
    const drumH = 3.5 * scale;
    const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(drumR, drumR, drumH, 8), mats.stucco);
    drumBody.position.y = drumH / 2;
    domeG.add(drumBody);
    const cupola = new THREE.Mesh(new THREE.SphereGeometry(drumR + 0.3 * scale, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
    cupola.position.y = drumH;
    domeG.add(cupola);
    const lantern = stoneBox(mats, 1.5 * scale, 2.5 * scale, 1.5 * scale);
    lantern.position.y = drumH + drumR;
    domeG.add(lantern);
    const dCross = createStoneCross(scale * 0.7, mats);
    dCross.position.y = drumH + drumR + 1.25 * scale;
    domeG.add(dCross);
    domeG.position.set(0, baseH + naveH - 1 * scale, transeptZ);
    domeG.userData.noCollision = true;
    domeG.traverse(c => { c.userData.noCollision = true; });
    g.add(domeG);

    // 6. ROOFS
    const createGableRoof = (w: number, l: number, h: number) => {
      const rg = new THREE.Group();
      const over = 1.2 * scale;
      const sw = Math.sqrt(Math.pow(w / 2 + over, 2) + Math.pow(h, 2));
      const ang = Math.atan2(h, w / 2 + over);
      for (const s of [-1, 1]) {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.4 * scale, l), mats.roof);
        pane.position.set(s * (w / 4 + over / 2), h / 2, 0);
        pane.rotation.z = -s * ang;
        rg.add(pane);
        
        for (let z = -l/2; z <= l/2; z += 1.5 * scale) {
            const tile = createRoofTile(scale, mats);
            tile.position.set(s * (w/2 + over), -0.1 * scale, z);
            tile.rotation.z = -s * (ang + Math.PI/2);
            rg.add(tile);
        }
      }
      rg.userData.noCollision = true;
      rg.traverse(c => { c.userData.noCollision = true; });
      return rg;
    };
    const r1 = createGableRoof(naveW, naveD, 4.5 * scale);
    r1.position.y = baseH + naveH;
    g.add(r1);

    const r2 = createGableRoof(transeptW, transeptD, 4.5 * scale);
    r2.position.set(0, baseH + naveH, transeptZ);
    r2.rotation.y = Math.PI / 2;
    g.add(r2);

    // 7. APSE
    const apseG = new THREE.Group();
    const apseBody = new THREE.Mesh(new THREE.CylinderGeometry(apseR + 0.05 * scale, apseR + 0.05 * scale, naveH, 32), mats.stucco);
    apseBody.position.y = naveH / 2;
    apseG.add(apseBody);
    const apseRoof = new THREE.Mesh(new THREE.SphereGeometry(apseR + 0.45 * scale, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
    apseRoof.position.y = naveH - 0.1 * scale;
    apseG.add(apseRoof);
    const apseCross = createStoneCross(scale * 0.6, mats);
    apseCross.position.set(0, naveH + apseR + 0.3 * scale, 0);
    apseG.add(apseCross);
    // Nudge slightly into the nave to avoid Z-fighting
    apseG.position.set(0, baseH, -naveD / 2 + 0.1 * scale);
    apseG.userData.noCollision = true;
    apseG.traverse(c => { c.userData.noCollision = true; });
    g.add(apseG);

    // 8. STEPPED BUTTRESSES & RECTANGULAR SIDE WINDOWS
    for (let z = -naveD / 2 + 3 * scale; z <= naveD / 2 - 3 * scale; z += 5 * scale) {
      if (Math.abs(z - transeptZ) < 4 * scale) continue;
      for (const side of [-1, 1]) {
        const buttG = new THREE.Group();
        const bW = 1.5 * scale;
        const bD = 2.0 * scale;
        const lowerH = naveH * 0.5;
        const upperH = naveH * 0.4;
        const lower = stoneBox(mats, bW, lowerH, bD);
        lower.position.y = lowerH / 2;
        buttG.add(lower);
        const upper = stoneBox(mats, bW, upperH, bD * 0.7);
        upper.position.set(0, lowerH + upperH / 2, -bD * 0.15);
        buttG.add(upper);
        const gargoyle = stoneBox(mats, 0.4 * scale, 0.25 * scale, 0.8 * scale);
        gargoyle.position.set(0, lowerH + upperH, -bD * 0.5);
        buttG.add(gargoyle);
        buttG.position.set(side * (naveW / 2 + 0.7 * scale), baseH, z);
        buttG.userData.noCollision = true;
        buttG.traverse(c => { c.userData.noCollision = true; });
        g.add(buttG);

        const sideWin = createRectangularGlassWindow(1.5 * scale, 4.5 * scale, scale, mats);
        sideWin.position.set(side * (naveW / 2), baseH + naveH * 0.3, z);
        sideWin.rotation.y = side * Math.PI / 2;
        g.add(sideWin);
      }
    }

    // ── Collision proxies (explicit invisible hitboxes) ──────────
    const naveColl = boxCollider(naveW + 0.2 * scale, naveH + baseH, naveD + 0.2 * scale);
    naveColl.position.set(0, (naveH + baseH) / 2, 0);
    g.add(naveColl);

    const baseColl = boxCollider(transeptW + 4 * scale, baseH, plinthD + 0.2 * scale);
    baseColl.position.set(0, baseH / 2, plinthZ);
    g.add(baseColl);

    const transColl = boxCollider(transeptW + 0.2 * scale, naveH + baseH, transeptD + 0.2 * scale);
    transColl.position.set(0, (naveH + baseH) / 2, transeptZ);
    g.add(transColl);

    const towerColl = boxCollider(tw + 0.2 * scale, th1 + th2 + baseH, tw + 0.2 * scale);
    towerColl.position.set(towerG.position.x, (th1 + th2 + baseH) / 2, towerG.position.z);
    g.add(towerColl);

    const facadeColl = boxCollider(naveW + 3.6 * scale, facadeH + baseH, facadeT + 0.4 * scale);
    facadeColl.position.set(0, (facadeH + baseH) / 2, naveD / 2 + facadeT / 2);
    g.add(facadeColl);

    const apseColl = boxCollider(apseR * 2 + 0.2 * scale, naveH + baseH, apseR * 1.3);
    apseColl.position.set(0, (naveH + baseH) / 2, -naveD / 2 - apseR / 2);
    g.add(apseColl);

    const domeColl = boxCollider(drumR * 2, drumH + drumR, drumR * 2);
    domeColl.position.set(0, baseH + naveH + (drumH + drumR) / 2, transeptZ);
    g.add(domeColl);

    const portalColl = boxCollider(6.8 * scale, 8.8 * scale, 2.5 * scale);
    portalColl.position.set(0, (8.8 * scale) / 2, naveD / 2 + facadeT + 0.8 * scale);
    g.add(portalColl);

    // Roof Colliders (Gabled)
    const addGableColliders = (w: number, l: number, h: number, y: number, z: number, ry: number = 0) => {
        const over = 1.2 * scale;
        const sw = Math.sqrt(Math.pow(w / 2 + over, 2) + Math.pow(h, 2));
        const ang = Math.atan2(h, w / 2 + over);
        for (const s of [-1, 1]) {
            const rColl = boxCollider(sw, 0.4 * scale, l);
            const rg = new THREE.Group();
            rColl.position.set(s * (w / 4 + over / 2), h / 2, 0);
            rColl.rotation.z = -s * ang;
            rg.add(rColl);
            rg.position.set(0, y, z);
            rg.rotation.y = ry;
            g.add(rg);
        }
    };
    addGableColliders(naveW, naveD, 4.5 * scale, baseH + naveH, 0);
    addGableColliders(transeptW, transeptD, 4.5 * scale, baseH + naveH, transeptZ, Math.PI / 2);

    // Buttress Proxies
    for (let z = -naveD / 2 + 3 * scale; z <= naveD / 2 - 3 * scale; z += 5 * scale) {
        if (Math.abs(z - transeptZ) < 4 * scale) continue;
        for (const side of [-1, 1]) {
            const buttProxy = boxCollider(1.5 * scale, naveH * 0.9, 2.0 * scale);
            buttProxy.position.set(side * (naveW / 2 + 0.7 * scale), baseH + (naveH * 0.9) / 2, z);
            g.add(buttProxy);
        }
    }

    // Final Polish: World-tile stone and roof surfaces to avoid stretching
    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.roof);
    // Stucco is untiled (flat color) in the standard Malaka pattern
    
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenChurch);

