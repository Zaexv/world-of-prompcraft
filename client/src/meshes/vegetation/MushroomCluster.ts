import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';

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
    cap.position.set(ox, h + 0.3 * scale, oz);
    cap.userData.noCollision = true;
    g.add(cap);
  }
  return g;
}

export class MushroomCluster extends Mesh {
  static readonly type = 'mushroom_cluster';
  static readonly category = 'vegetation' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    const count = 4 + Math.floor(Math.random() * 4);
    const stems: StemData[] = Array.from({ length: count }, () => ({
      h: (0.6 + Math.random() * 1.2) * scale,
      r: (0.4 + Math.random() * 0.6) * scale,
      ox: (Math.random() - 0.5) * 3 * scale,
      oz: (Math.random() - 0.5) * 3 * scale,
    }));

    lod.addLevel(buildMushroomGroup(scale, stems, 6, 8), 0);    // Full (0–130)
    lod.addLevel(buildMushroomGroup(scale, stems, 5, 6), 130); // Mid (130–340)
    lod.addLevel(buildMushroomGroup(scale, stems, 4, 5), 340); // Low (340+)

    return lod;
  }
}

registerMesh(MushroomCluster);

