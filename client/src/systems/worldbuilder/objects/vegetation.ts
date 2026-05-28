import * as THREE from 'three';
import { applyBarkPBR, applyCanopyPBR } from '../../../utils/PBRMaps';

// ── Ancient Tree ──────────────────────────────────────────────────────────────

interface TreeLayer { y: number; r: number; h: number; }

function buildTreeGroup(scale: number, segs: number, layers: TreeLayer[], castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.95 });
  applyBarkPBR(trunkMat);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.85 });
  applyCanopyPBR(canopyMat);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 6 * scale, segs), trunkMat);
  trunk.position.y = 3 * scale;
  trunk.castShadow = castShadow;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  for (const l of layers) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(l.r * scale, l.h * scale, segs), canopyMat);
    mesh.position.y = l.y * scale;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    mesh.userData.noCollision = true;
    g.add(mesh);
  }
  return g;
}

function buildTreeGroupFlat(scale: number, segs: number, layers: TreeLayer[]): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshBasicMaterial({ color: 0x3a2510 });
  const canopyMat = new THREE.MeshBasicMaterial({ color: 0x2a5a2a });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 6 * scale, segs), trunkMat);
  trunk.position.y = 3 * scale;
  trunk.userData.isCollider = true;
  g.add(trunk);

  for (const l of layers) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(l.r * scale, l.h * scale, segs), canopyMat);
    mesh.position.y = l.y * scale;
    mesh.userData.noCollision = true;
    g.add(mesh);
  }
  return g;
}

export function buildAncientTree(pos: THREE.Vector3, scale: number): THREE.LOD {
  const lod = new THREE.LOD();
  lod.position.copy(pos);

  const layers: TreeLayer[] = [
    { y: 7, r: 3.5, h: 3 },
    { y: 9, r: 2.5, h: 2.5 },
    { y: 11, r: 1.5, h: 2 },
  ];

  // Level 0: Full (0–120) — 8-seg, 3 canopy layers, PBR textures, shadows
  lod.addLevel(buildTreeGroup(scale, 8, layers, true), 0);
  // Level 1: Mid (120–240) — 6-seg, 2 layers, PBR textures, shadows
  lod.addLevel(buildTreeGroup(scale, 6, layers.slice(0, 2), true), 120);
  // Level 2: Low (240–400) — 5-seg, 1 layer, flat color (no texture sampling)
  lod.addLevel(buildTreeGroupFlat(scale, 5, layers.slice(0, 1)), 240);
  // Level 3: Silhouette (400+) — 4-seg, 1 layer, flat color
  lod.addLevel(buildTreeGroupFlat(scale, 4, layers.slice(0, 1)), 400);

  return lod;
}

// ── Mushroom Cluster ──────────────────────────────────────────────────────────

interface StemData { h: number; r: number; ox: number; oz: number; }

function buildMushroomGroup(scale: number, stems: StemData[], stemSegs: number, capSegs: number): THREE.Group {
  const g = new THREE.Group();
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x2255aa,
    emissive: new THREE.Color(0x0033cc),
    emissiveIntensity: 0.6,
    roughness: 0.7,
  });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.85 });

  for (const { h, r, ox, oz } of stems) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.15 * scale, h, stemSegs), stemMat);
    stem.position.set(ox, h / 2, oz);
    stem.userData.isCollider = true;
    g.add(stem);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.3, 0.4 * scale, capSegs), capMat);
    cap.position.set(ox, h + 0.2 * scale, oz);
    cap.userData.noCollision = true;
    g.add(cap);
  }
  return g;
}

export function buildMushroomCluster(pos: THREE.Vector3, scale: number): THREE.LOD {
  const lod = new THREE.LOD();
  lod.position.copy(pos);

  const count = 4 + Math.floor(Math.random() * 4);
  const stems: StemData[] = Array.from({ length: count }, () => ({
    h: (0.6 + Math.random() * 1.2) * scale,
    r: (0.4 + Math.random() * 0.6) * scale,
    ox: (Math.random() - 0.5) * 3 * scale,
    oz: (Math.random() - 0.5) * 3 * scale,
  }));

  lod.addLevel(buildMushroomGroup(scale, stems, 6, 8), 0);   // Full (0–80)
  lod.addLevel(buildMushroomGroup(scale, stems, 5, 6), 80);  // Mid (80–220)
  lod.addLevel(buildMushroomGroup(scale, stems, 4, 5), 220); // Low (220+)

  return lod;
}

// ── Crystal Cluster ───────────────────────────────────────────────────────────

interface CrystalData { h: number; r: number; ox: number; oz: number; rz: number; rx: number; }

function buildCrystalGroup(scale: number, crystals: CrystalData[], segs: number, castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x44ffcc,
    emissive: new THREE.Color(0x00ffaa),
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.3,
  });

  for (const { h, r, ox, oz, rz, rx } of crystals) {
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), crystalMat);
    crystal.position.set(ox, h / 2, oz);
    crystal.rotation.z = rz;
    crystal.rotation.x = rx;
    crystal.castShadow = castShadow;
    crystal.userData.isCollider = true;
    g.add(crystal);
  }
  return g;
}

export function buildCrystalCluster(pos: THREE.Vector3, scale: number): THREE.LOD {
  const lod = new THREE.LOD();
  lod.position.copy(pos);

  const count = 3 + Math.floor(Math.random() * 5);
  const crystals: CrystalData[] = Array.from({ length: count }, () => ({
    h: (0.8 + Math.random() * 2.5) * scale,
    r: (0.15 + Math.random() * 0.2) * scale,
    ox: (Math.random() - 0.5) * 2 * scale,
    oz: (Math.random() - 0.5) * 2 * scale,
    rz: (Math.random() - 0.5) * 0.4,
    rx: (Math.random() - 0.5) * 0.3,
  }));

  lod.addLevel(buildCrystalGroup(scale, crystals, 5, true), 0);    // Full (0–100)
  lod.addLevel(buildCrystalGroup(scale, crystals, 4, false), 100); // Mid (100–260)
  lod.addLevel(buildCrystalGroup(scale, crystals, 4, false), 260); // Low (260+)

  return lod;
}
