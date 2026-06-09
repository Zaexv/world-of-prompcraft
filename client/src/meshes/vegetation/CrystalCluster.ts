import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';

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

export class CrystalCluster extends Mesh {
  static readonly type = 'crystal_cluster';
  static readonly category = 'vegetation' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
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

    lod.addLevel(buildCrystalGroup(scale, crystals, 5, true), 0);    // Full (0–160)
    lod.addLevel(buildCrystalGroup(scale, crystals, 4, false), 160); // Mid (160–400)
    lod.addLevel(buildCrystalGroup(scale, crystals, 4, false), 400); // Low (400+)

    return lod;
  }
}

registerMesh(CrystalCluster);

