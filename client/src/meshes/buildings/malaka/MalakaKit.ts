/**
 * MalakaKit — shared materials and architectural helpers for the Málaga /
 * Andalusian building set. Every Málaga building class imports from here so the
 * material cache (textures, PBR maps) is built once and reused across all of them.
 */

import * as THREE from 'three';
import { applyMalakaPBR } from '../../../utils/PBRMaps';

// ─── Procedural Canvas Texture Generators ──────────────────────────────────────

function createStuccoTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff'; // Pure Andalusian White
  ctx.fillRect(0, 0, 256, 256);

  // Add subtle plaster grain
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTerracottaRoofTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Deep Saturated Terracotta Red
  ctx.fillStyle = '#a63d2d';
  ctx.fillRect(0, 0, 256, 256);

  // Draw tile lines
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#4a1810'; // Deep dark crevices
  for (let x = 0; x < 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();

    for (let y = 0; y < 256; y += 32) {
      const offset = (x / 16) % 2 === 0 ? 0 : 16;
      ctx.beginPath();
      ctx.moveTo(x, y + offset);
      ctx.lineTo(x + 16, y + offset);
      ctx.stroke();

      // Real clay highlight
      ctx.fillStyle = '#c15541';
      ctx.fillRect(x, y + offset - 3, 16, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStoneWallTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#eeeeee'; // Match city limestone white
  ctx.fillRect(0, 0, 256, 256);

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#333333'; // Sharp dark grout lines
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();

    const offsetX = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offsetX; x <= 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 32);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWoodTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1a1a1a'; // Deep Black/Dark Brown Wood
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#111111';
  for (let i = 0; i < 200; i++) {
    const w = 1 + Math.random() * 2;
    const h = 20 + Math.random() * 100;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Material Cache (Singleton) ───────────────────────────────────────────────

export interface MedMaterials {
  stucco: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
}

let _materials: MedMaterials | null = null;

export function getMaterials(): MedMaterials {
  if (!_materials) {
    _materials = {
      stucco: (() => {
        const m = new THREE.MeshStandardMaterial({
          map: createStuccoTexture(),
          roughness: 0.95,
        });
        applyMalakaPBR(m, 'stucco');
        return m;
      })(),
      roof: (() => {
        const m = new THREE.MeshStandardMaterial({
          map: createTerracottaRoofTexture(),
          roughness: 0.8,
        });
        applyMalakaPBR(m, 'roof');
        return m;
      })(),
      stone: (() => {
        const m = new THREE.MeshStandardMaterial({ map: createStoneWallTexture(), roughness: 0.9 });
        applyMalakaPBR(m, 'stone');
        return m;
      })(),
      wood: new THREE.MeshStandardMaterial({
        map: createWoodTexture(),
        roughness: 0.8,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
        metalness: 0.8,
      }),
    };
  }
  return _materials;
}

// ─── Architectural Helpers ───────────────────────────────────────────────────

export function createArchedDoor(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();

  // Wooden door (bottom rectangular part)
  const doorH = height - (width / 2);
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, doorH, depth), mats.wood);
  door.position.y = doorH / 2;
  group.add(door);

  // Arched top
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(width / 2, width / 2, depth, 16, 1, false, 0, Math.PI),
    mats.wood
  );
  arch.rotation.x = Math.PI / 2;
  arch.position.y = doorH;
  group.add(arch);

  // Stone border (architrave)
  const borderSize = 0.15;
  const stoneArch = new THREE.Mesh(
    new THREE.CylinderGeometry(width / 2 + borderSize, width / 2, depth + 0.05, 16, 1, true, 0, Math.PI),
    mats.stone
  );
  stoneArch.rotation.x = Math.PI / 2;
  stoneArch.position.y = doorH;
  group.add(stoneArch);

  // Door Handle / Knocker (Brass)
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

  // 4 Posts
  for (const [x, z] of [[-width/2, -depth/2], [width/2, -depth/2], [-width/2, depth/2], [width/2, depth/2]]) {
    const post = new THREE.Mesh(postGeo, mats.wood);
    post.position.set(x, postH/2, z);
    g.add(post);
  }

  // Cross beams
  const beamMat = mats.wood;
  const topH = postH + 0.1 * scale;
  for (let i = -2; i <= 2; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4 * scale, 0.1 * scale, 0.1 * scale), beamMat);
    beam.position.set(0, topH, i * (depth / 4));
    g.add(beam);
  }

  // Vines (green spheres)
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1a5d1a });
  for (let i = 0; i < 15; i++) {
    const vine = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 4, 4), vineMat);
    vine.position.set((Math.random()-0.5) * width, topH + 0.1 * scale, (Math.random()-0.5) * depth);
    g.add(vine);
  }

  return g;
}

export function createRoofTile(scale: number, mats: MedMaterials): THREE.Mesh {
  // A single curved tile (Teja)
  const geo = new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 0.4 * scale, 8, 1, true, 0, Math.PI);
  const tile = new THREE.Mesh(geo, mats.roof);
  tile.rotation.x = Math.PI / 2;
  return tile;
}

export function createWindowWithGrille(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();

  // Glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1 * scale), mats.glass);
  g.add(glass);

  // Iron Grille (simplified with lines/wireframe)
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.5 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.05, height + 0.05, 0.05 * scale), ironMat);
  frame.position.z = 0.1 * scale;
  g.add(frame);

  for (let i = -1; i <= 1; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02 * scale, height, 0.02 * scale), ironMat);
    bar.position.set(i * (width / 3), 0, 0.12 * scale);
    g.add(bar);
  }

  return g;
}

export function createFlowerPot(scale: number): THREE.Group {
  const g = new THREE.Group();

  // Pot
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.1 * scale, 0.2 * scale, 8), potMat);
  g.add(pot);

  // Plant (green)
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 1.0 });
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 6, 6), plantMat);
  plant.position.y = 0.15 * scale;
  g.add(plant);

  // Flowers (red)
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
