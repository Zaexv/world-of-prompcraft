/**
 * MalakaKit — shared materials and architectural helpers for the Málaga /
 * Andalusian building set. Every Málaga building class imports from here so the
 * material cache (textures, PBR maps) is built once and reused across all of them.
 */

import * as THREE from 'three';
import { applyMalakaPBR } from '../../../utils/PBRMaps';

// ─── Material Cache (Singleton) ───────────────────────────────────────────────

export interface MedMaterials {
  stucco: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  terracotta: THREE.MeshStandardMaterial;
  azulejo: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
}

let _materials: MedMaterials | null = null;

export function getMaterials(): MedMaterials {
  if (!_materials) {
    _materials = {
      stucco: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 1.0 });
        applyMalakaPBR(m, 'stucco');
        // Whitewashed Andalusian plaster (Cal): Pure brilliant white.
        // Disable the diffuse map because it makes the building look grey;
        // the normal map still provides the necessary surface relief.
        m.map = null;
        m.color.set(0xffffff);
        // Subtle emissive boost ensures the walls look white even in shadow
        m.emissive.set(0x333333); 
        m.needsUpdate = true;
        return m;
      })(),
      roof: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
        applyMalakaPBR(m, 'roof');
        return m;
      })(),
      stone: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
        applyMalakaPBR(m, 'stone');
        return m;
      })(),
      wood: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
        applyMalakaPBR(m, 'wood');
        return m;
      })(),
      terracotta: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
        applyMalakaPBR(m, 'stone'); 
        m.color.set(0xc66542); // Slightly warmer terracotta
        return m;
      })(),
      azulejo: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.05, metalness: 0.3 });
        applyMalakaPBR(m, 'stucco'); 
        m.color.set(0xdff5ff); // More vibrant ceramic white-blue
        if (m.normalMap) m.normalMap.repeat.set(24, 24);
        return m;
      })(),
      foliage: new THREE.MeshStandardMaterial({ 
        color: 0x388e3c, 
        roughness: 0.8, 
        emissive: 0x051a05 
      }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x223344,
        roughness: 0.05,
        metalness: 0.9,
        transparent: true,
        opacity: 0.9,
      }),
    };
  }
  return _materials;
}

// ─── Architectural Helpers ───────────────────────────────────────────────────

export function createDoor(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();

  // Stone frame
  const frameW = 0.15;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + frameW, height + frameW / 2, depth + 0.05), mats.stone);
  frame.position.y = (height + frameW / 2) / 2;
  group.add(frame);

  // Wooden door
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mats.wood);
  door.position.y = height / 2;
  door.position.z = 0.01;
  group.add(door);

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
  const mats = getMaterials();

  // Pot
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.1 * scale, 0.2 * scale, 8), mats.terracotta);
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

export function createArchedDoor(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();
  const archR = width / 2;
  const rectH = height - archR;

  // 1. Wooden Door Arch
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-width / 2, 0);
  doorShape.lineTo(-width / 2, rectH);
  doorShape.absarc(0, rectH, archR, Math.PI, 0, true);
  doorShape.lineTo(width / 2, 0);
  doorShape.closePath();

  const doorGeo = new THREE.ExtrudeGeometry(doorShape, { depth, bevelEnabled: false });
  const door = new THREE.Mesh(doorGeo, mats.wood);
  door.position.z = -depth / 2;
  group.add(door);

  // 2. Stone Frame Border
  const bw = 0.25; // Border width
  const frameShape = new THREE.Shape();
  // Outer path
  frameShape.moveTo(-width / 2 - bw, 0);
  frameShape.lineTo(-width / 2 - bw, rectH);
  frameShape.absarc(0, rectH, archR + bw, Math.PI, 0, true);
  frameShape.lineTo(width / 2 + bw, 0);
  frameShape.lineTo(width / 2 + bw, -0.05);
  frameShape.lineTo(-width / 2 - bw, -0.05);
  
  // Inner hole (subtraction)
  const hole = new THREE.Path();
  hole.moveTo(-width / 2, 0);
  hole.lineTo(width / 2, 0);
  hole.lineTo(width / 2, rectH);
  hole.absarc(0, rectH, archR, 0, Math.PI, false);
  hole.lineTo(-width / 2, 0);
  frameShape.holes.push(hole);

  const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: depth + 0.1, bevelEnabled: false });
  const frame = new THREE.Mesh(frameGeo, mats.stone);
  frame.position.z = -depth / 2 - 0.05;
  group.add(frame);

  // 3. Central Door Joint (Stripe)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, height, 0.02), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  stripe.position.set(0, height / 2, depth / 2 + 0.01);
  group.add(stripe);

  return group;
}

export function createCastleGate(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();
  
  // Rectangular frame
  const frameW = 0.2 * width;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + frameW, height, depth + 0.1), mats.stone);
  frame.position.y = height / 2;
  group.add(frame);

  // Opening (empty space, but we'll put a darker stone or just leave it)
  const opening = new THREE.Mesh(new THREE.BoxGeometry(width, height - frameW / 2, depth + 0.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  opening.position.y = (height - frameW / 2) / 2;
  group.add(opening);

  return group;
}

export function createArrowSlit(height: number, scale: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1.0 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, height, 0.05 * scale), mat);
  return mesh;
}

export function createWoodenBench(scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const legH = 0.4 * scale;
  const seatW = 1.2 * scale;
  const seatD = 0.4 * scale;

  // Legs
  for (const [x, z] of [[-0.5, -0.15], [0.5, -0.15], [-0.5, 0.15], [0.5, 0.15]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, legH, 0.08 * scale), mats.wood);
    leg.position.set(x * seatW * 0.8, legH / 2, z * seatD * 2);
    g.add(leg);
  }

  // Seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.08 * scale, seatD), mats.wood);
  seat.position.y = legH + 0.04 * scale;
  g.add(seat);

  // Backrest
  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.4 * scale, 0.05 * scale), mats.wood);
  back.position.set(0, legH + 0.3 * scale, -seatD / 2);
  g.add(back);

  return g;
}

export function createWoodenTable(scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const legH = 0.6 * scale;
  const topSize = 0.8 * scale;

  // Legs
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, legH, 0.08 * scale), mats.wood);
    leg.position.set(x * topSize * 0.4, legH / 2, z * topSize * 0.4);
    g.add(leg);
  }

  // Top
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
    leaf.position.set(x, y, (Math.random() * 0.1) * scale);
    g.add(leaf);

    // Occasional flowers
    if (Math.random() > 0.7) {
      const flMat = new THREE.MeshStandardMaterial({ color: 0xe91e63 }); // Bougainvillea pink
      const fl = new THREE.Mesh(new THREE.SphereGeometry(s * 0.4, 4, 4), flMat);
      fl.position.set(x + 0.05 * scale, y + 0.05 * scale, 0.1 * scale);
      g.add(fl);
    }
  }
  return g;
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
