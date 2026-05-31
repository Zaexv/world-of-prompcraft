import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createDoor, createRoofTile, withLOD } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

function stoneBox(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createStoneCross(scale: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const t = 0.12 * scale;
  const v = new THREE.Mesh(new THREE.BoxGeometry(t, 1.2 * scale, t), mat);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, t, t), mat);
  h.position.y = 0.2 * scale;
  g.add(v, h);
  v.castShadow = h.castShadow = true;
  return g;
}

/**
 * Creates a realistic rectangular glass window.
 */
function createRectangularGlassWindow(width: number, height: number, scale: number, stoneMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    
    // 1. Stone Frame (Rectangular)
    const frameT = 0.4 * scale;
    const frame = stoneBox(width + frameT, height + frameT / 2, frameT, stoneMat);
    frame.position.y = (height + frameT / 4) / 2;
    group.add(frame);

    // 2. Glass Pane (Realistic Material)
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        emissive: 0x112244,
        metalness: 1.0,
        roughness: 0.02,
        transparent: true,
        opacity: 0.5
    });

    const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1 * scale), glassMat);
    glass.position.y = height / 2;
    glass.position.z = 0.05 * scale;
    group.add(glass);

    // 3. Stone Tracery (Horizontal and Vertical bars)
    const mullionV = stoneBox(0.12 * scale, height, 0.15 * scale, stoneMat);
    mullionV.position.set(0, height/2, 0.1 * scale);
    group.add(mullionV);

    const mullionH = stoneBox(width, 0.12 * scale, 0.15 * scale, stoneMat);
    mullionH.position.set(0, height/2, 0.1 * scale);
    group.add(mullionH);

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
    const stoneMat = mats.stone;

    // Helper for Corbel Tables
    const addCorbels = (parent: THREE.Group, width: number, length: number, height: number, spacing: number) => {
        const corbelG = new THREE.Group();
        const countX = Math.floor(width / spacing);
        const countZ = Math.floor(length / spacing);
        for (let i = 0; i <= countX; i++) {
            const x = -width/2 + i * spacing;
            for (const side of [-1, 1]) {
                const c = stoneBox(0.2 * scale, 0.3 * scale, 0.3 * scale, stoneMat);
                c.position.set(x, height - 0.2 * scale, side * (length/2 + 0.1 * scale));
                corbelG.add(c);
            }
        }
        for (let i = 0; i <= countZ; i++) {
            const z = -length/2 + i * spacing;
            for (const side of [-1, 1]) {
                const c = stoneBox(0.3 * scale, 0.3 * scale, 0.2 * scale, stoneMat);
                c.position.set(side * (width/2 + 0.1 * scale), height - 0.2 * scale, z);
                corbelG.add(c);
            }
        }
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

    const plinth = stoneBox(transeptW + 4 * scale, baseH, plinthD, stoneMat);
    plinth.position.set(0, baseH / 2, plinthZ);
    g.add(plinth);

    // 2. MAIN BODIES
    const createBody = (w: number, h: number, d: number) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.stucco);
      body.position.y = h / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      // Corner Quoins
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          for (let y = 0.3 * scale; y < h; y += 0.8 * scale) {
            const quoin = stoneBox(0.6 * scale, 0.4 * scale, 0.6 * scale, stoneMat);
            quoin.position.set(sx * (w / 2), y, sz * (d / 2));
            group.add(quoin);
          }
        }
      }
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
        const win = createRectangularGlassWindow(4 * scale, 8 * scale, scale, stoneMat);
        win.position.set(side * (transeptW / 2), naveH * 0.15, 0);
        win.rotation.y = side * Math.PI / 2;
        transBody.add(win);
    }
    g.add(transBody);

    // 3. FRONT FACADE
    const facadeH = naveH + 6 * scale;
    const facadeBody = new THREE.Mesh(new THREE.BoxGeometry(naveW + 3.5 * scale, facadeH, facadeT), mats.stucco);
    facadeBody.position.set(0, baseH + facadeH / 2, naveD / 2 + facadeT / 2 - 0.1 * scale);
    facadeBody.castShadow = true;
    g.add(facadeBody);

    const portalG = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const pw = (6.5 - i * 0.7) * scale;
      const ph = (8.5 - i * 0.6) * scale;
      const layer = stoneBox(pw, ph, 0.4 * scale, stoneMat);
      layer.position.set(0, ph / 2, i * 0.45 * scale);
      portalG.add(layer);
      
      if (i === 4) {
          const tym = new THREE.Mesh(new THREE.CylinderGeometry(pw/2, pw/2, 0.15 * scale, 16, 1, false, 0, Math.PI), stoneMat);
          tym.rotation.x = Math.PI / 2;
          tym.position.y = ph - pw/2;
          tym.position.z = 0.2 * scale;
          portalG.add(tym);
      }
    }
    
    // Multi-tiered Columns
    const createOrnateColumn = (sx: number, z: number, h: number) => {
        const cg = new THREE.Group();
        const base = stoneBox(0.6 * scale, 0.5 * scale, 0.6 * scale, stoneMat);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.3 * scale, h, 8), stoneMat);
        shaft.position.y = h/2 + 0.25 * scale;
        const capital = stoneBox(0.7 * scale, 0.4 * scale, 0.7 * scale, stoneMat);
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
        const frame = stoneBox(1.1 * scale, 2.4 * scale, 0.6 * scale, stoneMat);
        nicheG.add(frame);
        const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 1.4 * scale, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        statue.position.set(0, 0, 0.25 * scale);
        nicheG.add(statue);
        nicheG.position.set(sx * 4.2 * scale, 4.0 * scale, 0.2 * scale);
        portalG.add(nicheG);
    }

    portalG.position.set(0, baseH, naveD / 2 + facadeT - 0.1 * scale);
    g.add(portalG);

    // Rose Window
    const roseG = new THREE.Group();
    const roseR = 2.4 * scale;
    const roseFrame = new THREE.Mesh(new THREE.TorusGeometry(roseR, 0.4 * scale, 16, 48), stoneMat);
    const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(roseR, 32), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.8 }));
    roseG.add(roseFrame, roseGlass);
    const roseCenter = new THREE.Mesh(new THREE.TorusGeometry(0.6 * scale, 0.2 * scale, 8, 24), stoneMat);
    roseCenter.position.z = 0.2 * scale;
    roseG.add(roseCenter);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = stoneBox(0.12 * scale, roseR * 1.9, 0.25 * scale, stoneMat);
        spoke.rotation.z = a;
        roseG.add(spoke);
    }
    roseG.position.set(0, baseH + naveH + 2.0 * scale, naveD / 2 + facadeT + 0.1 * scale);
    g.add(roseG);

    // Facade Cross
    const fCross = createStoneCross(scale, stoneMat);
    fCross.position.set(0, baseH + facadeH, naveD / 2 + facadeT / 2);
    g.add(fCross);

    // 4. BELL TOWER (Campanario)
    const towerG = new THREE.Group();
    const tw = 5.2 * scale;
    const th1 = 20 * scale;
    const th2 = 9 * scale;
    const towerBody = stoneBox(tw, th1, tw, stoneMat);
    towerBody.position.y = th1 / 2;
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
        const bFr = stoneBox(bW, bH, 0.8 * scale, stoneMat);
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

    const tCross = createStoneCross(scale * 0.9, stoneMat);
    tCross.position.y = th1 + th2 + 6.8 * scale; 
    towerG.add(tCross);

    towerG.position.set(-naveW / 2 - tw / 2 + 0.2 * scale, baseH, naveD / 2 - tw / 2 + 0.5 * scale);
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
    const lantern = stoneBox(1.5 * scale, 2.5 * scale, 1.5 * scale, stoneMat);
    lantern.position.y = drumH + drumR;
    const dCross = createStoneCross(scale * 0.7, stoneMat);
    dCross.position.y = drumH + drumR + 1.25 * scale;
    domeG.add(dCross);
    domeG.position.set(0, baseH + naveH - 1 * scale, transeptZ);
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
    const apseBody = new THREE.Mesh(new THREE.CylinderGeometry(apseR, apseR, naveH, 32), mats.stucco);
    apseBody.position.y = naveH / 2;
    apseG.add(apseBody);
    const apseRoof = new THREE.Mesh(new THREE.SphereGeometry(apseR + 0.4 * scale, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
    apseRoof.position.y = naveH - 0.1 * scale;
    apseG.add(apseRoof);
    const apseCross = createStoneCross(scale * 0.6, stoneMat);
    apseCross.position.set(0, naveH + apseR + 0.3 * scale, 0);
    apseG.add(apseCross);
    apseG.position.set(0, baseH, -naveD / 2);
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
        const lower = stoneBox(bW, lowerH, bD, stoneMat);
        lower.position.y = lowerH / 2;
        buttG.add(lower);
        const upper = stoneBox(bW, upperH, bD * 0.7, stoneMat);
        upper.position.set(0, lowerH + upperH / 2, -bD * 0.15);
        buttG.add(upper);
        const gargoyle = stoneBox(0.4 * scale, 0.25 * scale, 0.8 * scale, stoneMat);
        gargoyle.position.set(0, lowerH + upperH, -bD * 0.5);
        buttG.add(gargoyle);
        buttG.position.set(side * (naveW / 2 + 0.75 * scale), baseH, z);
        g.add(buttG);

        const sideWin = createRectangularGlassWindow(1.5 * scale, 4.5 * scale, scale, stoneMat);
        sideWin.position.set(side * (naveW / 2), baseH + naveH * 0.3, z);
        sideWin.rotation.y = side * Math.PI / 2;
        g.add(sideWin);
      }
    }

    // Colliders
    const naveColl = boxCollider(naveW, naveH, naveD);
    naveColl.position.set(0, baseH + naveH / 2, 0);
    g.add(naveColl);

    const transColl = boxCollider(transeptW, naveH, transeptD);
    transColl.position.set(0, baseH + naveH / 2, transeptZ);
    g.add(transColl);

    const towerColl = boxCollider(tw, th1 + th2, tw);
    towerColl.position.copy(towerG.position).add(new THREE.Vector3(0, (th1 + th2) / 2, 0));
    g.add(towerColl);

    const facadeColl = boxCollider(naveW + 3 * scale, facadeH, facadeT);
    facadeColl.position.set(0, baseH + facadeH / 2, naveD / 2 + facadeT / 2);
    g.add(facadeColl);

    const apseColl = boxCollider(apseR * 2, naveH, apseR * 1.2);
    apseColl.position.set(0, baseH + naveH / 2, -naveD / 2 - apseR / 2);
    g.add(apseColl);

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.roof);
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenChurch);
