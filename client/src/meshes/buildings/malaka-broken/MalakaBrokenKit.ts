/**
 * MalakaKit — shared materials and architectural helpers for the Málaga /
 * Andalusian building set. Every Málaga building class imports from here so the
 * material cache (textures, PBR maps) is built once and reused across all of them.
 */

import * as THREE from 'three';
import { applyMalakaPBR } from '../../../utils/PBRMaps';
import { mergeStaticByMaterial } from '../../core/mergeStatic';

// ─── Material Cache (Singleton) ───────────────────────────────────────────────

export interface MedMaterials {
  stucco: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  terracotta: THREE.MeshStandardMaterial;
  azulejo: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
}

let _materials: MedMaterials | null = null;

export function getMaterials(): MedMaterials {
  if (!_materials) {
    _materials = {
      stucco: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.95 });
        applyMalakaPBR(m, 'stucco');
        // Whitewashed Andalusian plaster: drop the grey albedo map and use a 
        // bright near-white base. The normal map still provides surface relief.
        m.map = null;
        m.color.set(0xf4f1eb);
        m.userData.flatColor = 0xf4f1eb;
        m.needsUpdate = true;
        return m;
      })(),
      roof: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.8 });
        applyMalakaPBR(m, 'roof');
        m.color.set(0xe8a478);
        m.userData.flatColor = 0x814e33; 
        return m;
      })(),
      stone: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.9 });
        applyMalakaPBR(m, 'stone');
        m.normalScale.set(1.0, 1.0);
        m.userData.flatColor = 0xb09773;
        return m;
      })(),
      wood: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.8 });
        applyMalakaPBR(m, 'wood');
        m.userData.flatColor = 0x47331f; 
        return m;
      })(),
      terracotta: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        applyMalakaPBR(m, 'stone');
        m.color.set(0xc66542);
        m.userData.flatColor = 0x9d5a3b;
        return m;
      })(),
      azulejo: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.2 });
        applyMalakaPBR(m, 'stucco');
        m.color.set(0xdff5ff);
        m.userData.flatColor = 0xcde1ea;
        return m;
      })(),
      foliage: new THREE.MeshStandardMaterial({
        color: 0x388e3c,
        roughness: 0.85,
        emissive: 0x051a05,
      }),
      glass: (() => {
        const tex = makeWindowTexture(256);
        const m = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.1,
          metalness: 0.3,
          color: 0x88ccff,
          emissive: 0x003366,
        });
        m.userData.flatColor = 0x4488ff;
        return m;
      })(),
      door: (() => {
        // Dark-wood door planks. Reuses the Poly Haven CC0 wood albedo+normal
        // already warmed onto the GPU at boot (warmUpTextures), so it has pixels
        // before any world-tiling clones it — unlike the old lazily-loaded
        // andalusian_door.jpg, which 404'd and spammed "no image data found".
        const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.0 });
        applyMalakaPBR(m, 'wood');
        m.userData.flatColor = 0x3d2b1f;
        return m;
      })(),
    };
  }
  return _materials;
}

/** Procedural leaded-glass window texture. */
function makeWindowTexture(size: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#66aaff'; 
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = size * 0.08;
  
  ctx.beginPath();
  ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 3); ctx.lineTo(size, size / 3);
  ctx.moveTo(0, 2 * size / 3); ctx.lineTo(size, 2 * size / 3);
  ctx.strokeRect(0, 0, size, size);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Distance LOD (simplified, flat-colour far levels) ────────────────────────

const _flatCache = new WeakMap<THREE.Material, THREE.Material>();
const SIMPLIFY_MIN_SIZE = 1.8;

function flatVariant(mat: THREE.Material): THREE.Material | null {
  const cached = _flatCache.get(mat);
  if (cached) return cached;
  const flatColor = mat.userData?.flatColor;
  if (typeof flatColor !== 'number') return null;
  const std = mat as THREE.MeshStandardMaterial;
  const flat = new THREE.MeshStandardMaterial({
    color: flatColor,
    roughness: typeof std.roughness === 'number' ? std.roughness : 0.9,
    metalness: 0,
  });
  _flatCache.set(mat, flat);
  return flat;
}

function makeReducedLevel(full: THREE.Group, simplify: boolean): THREE.Group {
  const level = full.clone(true);
  level.position.set(0, 0, 0);
  const toRemove: THREE.Object3D[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  level.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.visible) { toRemove.push(o); return; }
    if (simplify) {
      box.setFromObject(o);
      box.getSize(size);
      if (Math.max(size.x, size.y, size.z) < SIMPLIFY_MIN_SIZE) { toRemove.push(o); return; }
    }
    if (!Array.isArray(o.material)) {
      const flat = flatVariant(o.material);
      if (flat) o.material = flat;
    }
  });
  for (const o of toRemove) o.removeFromParent();
  return level;
}

export function withLOD(full: THREE.Group, midDist = 180, farDist = 380): THREE.LOD {
  const lod = new THREE.LOD();
  lod.position.copy(full.position);
  full.position.set(0, 0, 0);
  // Collapse the building's dozens of opaque sub-meshes into one draw per
  // material before deriving the LOD levels — buildings were the bulk of the
  // 5000+ draw calls that made the renderer CPU-bound.
  mergeStaticByMaterial(full);
  lod.addLevel(full, 0);
  lod.addLevel(makeReducedLevel(full, false), midDist);
  lod.addLevel(makeReducedLevel(full, true), farDist);
  return lod;
}

// ─── Architectural Helpers ───────────────────────────────────────────────────

export function createDoor(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();

  const frameW = 0.15;
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + frameW, height + frameW / 2, depth + 0.05),
    mats.stone
  );
  frame.position.y = (height + frameW / 2) / 2;
  group.add(frame);

  const sideMat = mats.wood;
  const frontMat = mats.door;
  const materials = [sideMat, sideMat, sideMat, sideMat, frontMat, frontMat];

  const door = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials);
  door.position.y = height / 2;
  door.position.z = 0.01;
  group.add(door);

  const studMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 });
  const studGeo = new THREE.SphereGeometry(0.04, 8, 8);
  for (let row = 1; row <= 6; row++) {
    for (let col = 1; col <= 4; col++) {
        const stud = new THREE.Mesh(studGeo, studMat);
        stud.position.set(
            -width/2 + (width/5) * col,
            height * (row / 7),
            depth/2 + 0.02
        );
        stud.scale.set(1, 1, 0.5);
        group.add(stud);
    }
  }

  const handleMat = new THREE.MeshStandardMaterial({ color: 0xaa8833, metalness: 0.9, roughness: 0.2 });
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16), handleMat);
  handle.position.set(width * 0.25, height * 0.45, depth / 2 + 0.05);
  group.add(handle);

  return group;
}

export function createArchedDoor(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();

  const doorH = height - (width / 2);
  const sideMat = mats.wood;
  const frontMat = mats.door;
  const materials = [sideMat, sideMat, sideMat, sideMat, frontMat, frontMat];

  const door = new THREE.Mesh(new THREE.BoxGeometry(width, doorH, depth), materials);
  door.position.y = doorH / 2;
  group.add(door);

  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(width / 2, width / 2, depth, 16, 1, false, 0, Math.PI),
    mats.door
  );
  arch.rotation.x = Math.PI / 2;
  arch.position.y = doorH;
  group.add(arch);

  const borderSize = 0.15;
  const stoneArch = new THREE.Mesh(
    new THREE.CylinderGeometry(width / 2 + borderSize, width / 2, depth + 0.05, 16, 1, true, 0, Math.PI),
    mats.stone
  );
  stoneArch.rotation.x = Math.PI / 2;
  stoneArch.position.y = doorH;
  group.add(stoneArch);

  const studMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 });
  const studGeo = new THREE.SphereGeometry(0.04, 8, 8);
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 4; col++) {
        const stud = new THREE.Mesh(studGeo, studMat);
        stud.position.set(
            -width/2 + (width/5) * col,
            doorH * (row / 5),
            depth/2 + 0.02
        );
        stud.scale.set(1, 1, 0.5);
        group.add(stud);
    }
  }

  const handleMat = new THREE.MeshStandardMaterial({ color: 0xaa8833, metalness: 0.9, roughness: 0.2 });
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16), handleMat);
  handle.position.set(width * 0.25, height * 0.45, depth / 2 + 0.05);
  group.add(handle);

  return group;
}

export function createChimney(scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const baseW = 0.4 * scale;
  const baseH = 0.8 * scale;
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseW), mats.stucco);
  base.position.y = baseH / 2;
  g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(baseW * 1.3, 0.1 * scale, baseW * 1.3), mats.roof);
  top.position.y = baseH + 0.05 * scale;
  g.add(top);
  return g;
}

export function createPergola(width: number, depth: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const postH = 2.2 * scale;
  const postGeo = new THREE.BoxGeometry(0.15 * scale, postH, 0.15 * scale);
  for (const [x, z] of [[-width/2, -depth/2], [width/2, -depth/2], [-width/2, depth/2], [width/2, depth/2]]) {
    const post = new THREE.Mesh(postGeo, mats.wood);
    post.position.set(x, postH/2, z);
    g.add(post);
  }
  const beamMat = mats.wood;
  const topH = postH + 0.1 * scale;
  for (let i = -2; i <= 2; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4 * scale, 0.1 * scale, 0.1 * scale), beamMat);
    beam.position.set(0, topH, i * (depth / 4));
    g.add(beam);
  }
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1a5d1a });
  for (let i = 0; i < 15; i++) {
    const vine = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 4, 4), vineMat);
    vine.position.set((Math.random()-0.5) * width, topH + 0.1 * scale, (Math.random()-0.5) * depth);
    g.add(vine);
  }
  return g;
}

export function createRoofTile(scale: number, mats: MedMaterials): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 0.4 * scale, 8, 1, true, 0, Math.PI);
  const tile = new THREE.Mesh(geo, mats.roof);
  tile.rotation.x = Math.PI / 2;
  return tile;
}

export function createWindowWithGrille(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();

  // Glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.05 * scale), mats.glass);
  g.add(glass);

  // Iron Grille (Hollow Frame + Bars)
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.5 });
  const t = 0.04 * scale; // thickness of bars
  
  // Frame Bars (Hollow)
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + t, t, t), ironMat);
  top.position.set(0, height / 2, 0.08 * scale);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(width + t, t, t), ironMat);
  bottom.position.set(0, -height / 2, 0.08 * scale);
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, height + t, t), ironMat);
  left.position.set(-width / 2, 0, 0.08 * scale);
  const right = new THREE.Mesh(new THREE.BoxGeometry(t, height + t, t), ironMat);
  right.position.set(width / 2, 0, 0.08 * scale);
  g.add(top, bottom, left, right);

  // Vertical Detail Bars
  for (let i = -1; i <= 1; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(t * 0.5, height, t * 0.5), ironMat);
    bar.position.set(i * (width / 3), 0, 0.1 * scale);
    g.add(bar);
  }

  return g;
}

export function createFlowerPot(scale: number): THREE.Group {
  const g = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.1 * scale, 0.2 * scale, 8), potMat);
  g.add(pot);
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 1.0 });
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 6, 6), plantMat);
  plant.position.y = 0.15 * scale;
  g.add(plant);
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000 });
  for (let i = 0; i < 3; i++) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 4, 4), flowerMat);
    fl.position.set(Math.cos(i * 2) * 0.1 * scale, 0.25 * scale, Math.sin(i * 2) * 0.1 * scale);
    g.add(fl);
  }
  return g;
}

export function createWoodenShutters(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const shutterW = width / 2;
  const sGeo = new THREE.BoxGeometry(shutterW, height, 0.05 * scale);
  const left = new THREE.Mesh(sGeo, mats.wood);
  left.position.set(-(width / 2 + shutterW / 2), 0, 0);
  g.add(left);
  const right = new THREE.Mesh(sGeo, mats.wood);
  right.position.set(width / 2 + shutterW / 2, 0, 0);
  g.add(right);
  return g;
}

export function createWoodenBench(scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const legH = 0.4 * scale;
  const seatW = 1.2 * scale;
  const seatD = 0.4 * scale;
  for (const [x, z] of [[-0.5, -0.15], [0.5, -0.15], [-0.5, 0.15], [0.5, 0.15]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, legH, 0.08 * scale), mats.wood);
    leg.position.set(x * seatW * 0.8, legH / 2, z * seatD * 2);
    g.add(leg);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.08 * scale, seatD), mats.wood);
  seat.position.y = legH + 0.04 * scale;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.4 * scale, 0.05 * scale), mats.wood);
  back.position.set(0, legH + 0.3 * scale, -seatD / 2);
  g.add(back);
  return g;
}

export function createWoodenTable(scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const legH = 0.6 * scale;
  const topSize = 0.8 * scale;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, legH, 0.08 * scale), mats.wood);
    leg.position.set(x * topSize * 0.4, legH / 2, z * topSize * 0.4);
    g.add(leg);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(topSize, 0.08 * scale, topSize), mats.wood);
  top.position.y = legH + 0.04 * scale;
  g.add(top);
  return g;
}

export function createClimbingPlant(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const count = 25;
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * width;
    const y = Math.random() * height;
    const s = (0.2 + Math.random() * 0.4) * scale;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(s, 4, 4), mats.foliage);
    leaf.position.set(x, y, Math.random() * 0.1 * scale);
    g.add(leaf);
    if (Math.random() > 0.7) {
      const flMat = new THREE.MeshStandardMaterial({ color: 0xe91e63 });
      const fl = new THREE.Mesh(new THREE.SphereGeometry(s * 0.4, 4, 4), flMat);
      fl.position.set(x + 0.05 * scale, y + 0.05 * scale, 0.1 * scale);
      g.add(fl);
    }
  }
  return g;
}

export function createHorseshoeArch(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();
  const archLegH = height - width / 2;
  const legGeo = new THREE.BoxGeometry(0.5 * width * 0.4, archLegH, depth);
  const leftLeg = new THREE.Mesh(legGeo, mats.stone);
  leftLeg.position.set(-width / 2, archLegH / 2, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, mats.stone);
  rightLeg.position.set(width / 2, archLegH / 2, 0);
  group.add(rightLeg);
  const horseshoe = new THREE.Mesh(
    new THREE.TorusGeometry(width / 2, 0.15 * width, 8, 16, Math.PI * 1.2),
    mats.stone
  );
  horseshoe.position.y = archLegH;
  horseshoe.rotation.z = -Math.PI * 0.1;
  group.add(horseshoe);
  return group;
}

export function createArrowSlit(height: number, scale: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1.0 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, height, 0.05 * scale), mat);
  return mesh;
}

export function createMachicolations(width: number, depth: number, y: number, mats: MedMaterials, scale: number): THREE.Group {
  const g = new THREE.Group();
  const count = Math.floor(width / (0.8 * scale));
  const spacing = width / count;
  for (let i = 0; i <= count; i++) {
    const x = -width / 2 + i * spacing;
    const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.6 * scale, 0.4 * scale), mats.stone);
    corbel.position.set(x, y - 0.3 * scale, depth / 2 + 0.1 * scale);
    g.add(corbel);
  }
  return g;
}
