import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials } from './MalakaKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyMalakaPBR } from '../../../utils/PBRMaps';

const STONE_UNITS_PER_TILE = 2.2;

/**
 * Rewrite a BoxGeometry's UVs so the stone texture tiles by world size.
 */
function tileBoxUVsWorld(geo: THREE.BoxGeometry, w: number, h: number, d: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const faceSpan: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const uTiles = Math.max(1, Math.round(faceSpan[f][0] / STONE_UNITS_PER_TILE));
    const vTiles = Math.max(1, Math.round(faceSpan[f][1] / STONE_UNITS_PER_TILE));
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * uTiles, uv.getY(idx) * vTiles);
    }
  }
  uv.needsUpdate = true;
}

function stoneBox(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  tileBoxUVsWorld(geo, w, h, d);
  return new THREE.Mesh(geo, mat);
}

let _worldStone: THREE.MeshStandardMaterial | null = null;
function getWorldStone(): THREE.MeshStandardMaterial {
  if (!_worldStone) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    applyMalakaPBR(m, 'stone');
    if (m.map) { m.map = m.map.clone(); m.map.repeat.set(1, 1); m.map.needsUpdate = true; }
    if (m.normalMap) { m.normalMap = m.normalMap.clone(); m.normalMap.repeat.set(1, 1); m.normalMap.needsUpdate = true; }
    m.needsUpdate = true;
    _worldStone = m;
  }
  return _worldStone;
}

export class MalakaCastle extends Mesh {
  static readonly type = 'malaka_castle';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const stoneMat = getWorldStone();

    // Helper for adding Crenellations (Merlons) to a rectangular wall top
    const addCrenellations = (parent: THREE.Group, width: number, depth: number, height: number) => {
      const merlonW = 0.8 * scale;
      const merlonH = 0.8 * scale;
      const merlonD = 0.4 * scale;
      const spacing = 1.2 * scale;

      const createSide = (w: number, d: number, rotationY: number, xOff: number, zOff: number) => {
        const sideG = new THREE.Group();
        const count = Math.floor(w / spacing);
        for (let i = 0; i < count; i++) {
          // Nudge merlon slightly outward to avoid Z-fighting with wall face
          const merlon = stoneBox(merlonW, merlonH, merlonD, stoneMat);
          merlon.position.set((i - count / 2 + 0.5) * spacing, height + merlonH / 2, 0.01 * scale);
          merlon.castShadow = true;
          sideG.add(merlon);
          
          const cap = stoneBox(merlonW + 0.1 * scale, 0.1 * scale, merlonD + 0.1 * scale, stoneMat);
          cap.position.set(merlon.position.x, height + merlonH + 0.05 * scale, 0.01 * scale);
          sideG.add(cap);
        }
        sideG.rotation.y = rotationY;
        sideG.position.set(xOff, 0, zOff);
        parent.add(sideG);
      };

      createSide(width, depth, 0, 0, depth / 2);
      createSide(width, depth, Math.PI, 0, -depth / 2);
      createSide(depth, width, Math.PI / 2, width / 2, 0);
      createSide(depth, width, -Math.PI / 2, -width / 2, 0);
    };

    // Helper for Arrow Slits
    const addArrowSlit = (parent: THREE.Group, x: number, y: number, z: number, rotY: number) => {
      const slitG = new THREE.Group();
      const frame = stoneBox(0.3 * scale, 1.2 * scale, 0.1 * scale, stoneMat);
      const voidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, 1.0 * scale, 0.15 * scale), new THREE.MeshStandardMaterial({ color: 0x000000 }));
      slitG.add(frame);
      slitG.add(voidMesh);
      slitG.position.set(x, y, z);
      slitG.rotation.y = rotY;
      parent.add(slitG);
    };

    // 1. Lower Defensive Tier (The Barbican)
    const tier1W = 16 * scale;
    const tier1H = 6 * scale;
    const base1 = stoneBox(tier1W, tier1H, tier1W, stoneMat);
    base1.position.y = tier1H / 2;
    base1.castShadow = base1.receiveShadow = true;
    g.add(base1);

    const base1Proxy = boxCollider(tier1W, tier1H, tier1W);
    base1Proxy.position.y = tier1H / 2;
    g.add(base1Proxy);

    addCrenellations(g, tier1W, tier1W, tier1H);

    // Stone Cornice (Trim) - nudged to avoid overlapping base1 top face
    const cornice1 = stoneBox(tier1W + 0.4 * scale, 0.38 * scale, tier1W + 0.4 * scale, stoneMat);
    cornice1.position.y = tier1H - 0.22 * scale;
    g.add(cornice1);

    // 2. Middle Palace Tier
    const tier2W = 10 * scale;
    const tier2H = 5 * scale;
    const tier2Z = -2 * scale;
    const base2 = stoneBox(tier2W, tier2H, tier2W, stoneMat);
    base2.position.set(0, tier1H + tier2H / 2, tier2Z);
    base2.castShadow = base2.receiveShadow = true;
    g.add(base2);

    const base2Proxy = boxCollider(tier2W, tier2H, tier2W);
    base2Proxy.position.set(0, tier1H + tier2H / 2, tier2Z);
    g.add(base2Proxy);

    const tier2G = new THREE.Group();
    tier2G.position.set(0, tier1H, tier2Z);
    addCrenellations(tier2G, tier2W, tier2W, tier2H);
    g.add(tier2G);

    // 3. Upper Keep (Torre del Homenaje)
    const keepW = 6 * scale;
    const keepH = 9 * scale;
    const keepZ = -4 * scale;
    const keep = stoneBox(keepW, keepH, keepW, stoneMat);
    keep.position.set(0, tier1H + tier2H + keepH / 2, keepZ);
    keep.castShadow = keep.receiveShadow = true;
    g.add(keep);

    const keepProxy = boxCollider(keepW, keepH, keepW);
    keepProxy.position.set(0, tier1H + tier2H + keepH / 2, keepZ);
    g.add(keepProxy);

    const keepG = new THREE.Group();
    keepG.position.set(0, tier1H + tier2H, keepZ);
    addCrenellations(keepG, keepW, keepW, keepH);
    
    // Add arrow slits to Keep
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i;
      addArrowSlit(keepG, Math.sin(angle) * (keepW / 2 + 0.05 * scale), keepH * 0.6, Math.cos(angle) * (keepW / 2 + 0.05 * scale), angle);
    }
    g.add(keepG);

    // 5. Advanced Corner Turrets
    for (const tx of [-1, 1]) {
      const turretH = 5 * scale;
      const turretR = 1.8 * scale;
      const turret = new THREE.Group();
      turret.position.set(tx * (tier1W / 2), tier1H, tier1W / 2);
      
      const body = new THREE.Mesh(new THREE.CylinderGeometry(turretR, turretR, turretH, 12), stoneMat);
      body.position.y = turretH / 2;
      body.castShadow = true;
      turret.add(body);

      // Turret Battlements
      const topR = turretR + 0.2 * scale;
      const topH = 1.0 * scale;
      const battlement = new THREE.Mesh(new THREE.CylinderGeometry(topR, turretR, topH, 12), stoneMat);
      battlement.position.y = turretH + topH / 2;
      turret.add(battlement);

      // Circular Crenellations
      const mCount = 8;
      for (let i = 0; i < mCount; i++) {
        const angle = (i / mCount) * Math.PI * 2;
        const merlon = stoneBox(0.6 * scale, 0.8 * scale, 0.4 * scale, stoneMat);
        merlon.position.set(Math.cos(angle) * topR, turretH + topH + 0.4 * scale, Math.sin(angle) * topR);
        merlon.rotation.y = -angle + Math.PI / 2;
        turret.add(merlon);
      }

      // Arrow slits in turret
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI + (tx > 0 ? 0 : Math.PI);
        addArrowSlit(turret, Math.cos(angle) * (turretR + 0.05 * scale), turretH * 0.5, Math.sin(angle) * (turretR + 0.05 * scale), -angle + Math.PI / 2);
      }

      g.add(turret);
    }

    // 6. Realistic Masonry Arched Entrance
    const gateWidth = 3.6 * scale;
    const gateHeight = 4.8 * scale;
    const gateDepth = 1.0 * scale;
    const gateGroup = new THREE.Group();

    const archRadius = gateWidth / 2;
    const archInnerH = gateHeight - archRadius;
    
    // Jambs
    const jambW = 0.6 * scale;
    for (const side of [-1, 1]) {
      const jamb = stoneBox(jambW, archInnerH, gateDepth, stoneMat);
      jamb.position.set(side * (archRadius + jambW / 2), archInnerH / 2, 0);
      gateGroup.add(jamb);
    }

    // Voussoirs
    const voussoirCount = 9;
    const voussoirDepth = gateDepth + 0.05 * scale;
    const voussoirHeight = 0.8 * scale;
    for (let i = 0; i < voussoirCount; i++) {
      const isKeystone = i === Math.floor(voussoirCount / 2);
      const angle = (i / (voussoirCount - 1)) * Math.PI;
      const blockW = isKeystone ? 1.0 * scale : 0.8 * scale;
      const blockH = isKeystone ? 1.0 * scale : voussoirHeight;
      const block = stoneBox(blockW, blockH, voussoirDepth, stoneMat);
      const r = archRadius + blockH / 2 - 0.1 * scale;
      block.position.set(-Math.cos(angle) * r, archInnerH + Math.sin(angle) * r, 0.01 * scale);
      block.rotation.z = angle - Math.PI / 2;
      gateGroup.add(block);
    }

    // Hood Mold
    const hoodPoints = [];
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI;
      const r = archRadius + voussoirHeight + 0.1 * scale;
      hoodPoints.push(new THREE.Vector3(-Math.cos(angle) * r, archInnerH + Math.sin(angle) * r, gateDepth / 2 + 0.1 * scale));
    }
    for (let i = 0; i < hoodPoints.length - 1; i++) {
      const start = hoodPoints[i];
      const end = hoodPoints[i+1];
      const dist = start.distanceTo(end);
      const segment = stoneBox(0.2 * scale, 0.15 * scale, dist + 0.05 * scale, stoneMat);
      segment.position.copy(start).lerp(end, 0.5);
      segment.lookAt(end);
      gateGroup.add(segment);
    }

    // Fortress Door
    const doorGroup = new THREE.Group();
    const doorThickness = 0.25 * scale;
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 });
    const createFortressDoorWing = (side: number) => {
      const wg = new THREE.Group();
      const plankW = (gateWidth / 2) / 3;
      for (let i = 0; i < 3; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(plankW - 0.02 * scale, gateHeight, doorThickness), mats.wood);
        plank.position.set(side * (plankW / 2 + i * plankW), gateHeight / 2, 0);
        wg.add(plank);
      }
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, gateHeight * 1.1, doorThickness + 0.02 * scale), mats.wood);
      brace.rotation.z = -side * Math.PI / 6;
      brace.position.set(side * gateWidth / 4, gateHeight / 2, 0);
      wg.add(brace);
      for (const y of [gateHeight * 0.2, gateHeight * 0.8]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(gateWidth / 2.5, 0.15 * scale, doorThickness + 0.05 * scale), ironMat);
        strap.position.set(side * (gateWidth / 2 - gateWidth / 5), y, 0);
        wg.add(strap);
      }
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18 * scale, 0.04 * scale, 8, 16), ironMat);
      handle.position.set(side * (gateWidth * 0.1), gateHeight * 0.45, doorThickness / 2 + 0.05 * scale);
      wg.add(handle);
      return wg;
    };
    doorGroup.add(createFortressDoorWing(-1));
    doorGroup.add(createFortressDoorWing(1));
    doorGroup.position.z = -0.15 * scale;
    gateGroup.add(doorGroup);

    gateGroup.position.set(0, 0, tier1W / 2 + 0.02 * scale);
    gateGroup.userData.noCollision = true;
    gateGroup.traverse(c => { 
      c.userData.noCollision = true;
      if (c instanceof THREE.Mesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    g.add(gateGroup);

    // 7. Stone Machicolations (Detailed Supports)
    const machicGroup = new THREE.Group();
    const mCount = 10;
    const mSpacing = tier1W / mCount;
    for (let i = 0; i <= mCount; i++) {
      const x = -tier1W / 2 + i * mSpacing;
      const bracket = stoneBox(0.4 * scale, 1.0 * scale, 0.6 * scale, stoneMat);
      bracket.position.set(x, tier1H - 0.5 * scale, tier1W / 2 + 0.1 * scale);
      machicGroup.add(bracket);
    }
    g.add(machicGroup);

    return g;
  }
}

registerMesh(MalakaCastle);
