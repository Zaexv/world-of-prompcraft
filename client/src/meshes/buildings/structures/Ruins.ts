import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { applyWorldTiling } from '../worldTiled';

interface RuinWall { x: number; z: number; h: number; rx: number; ry: number; }
interface RuinDebris { px: number; pz: number; size: number; ry: number; }

function buildRuinsGroup(scale: number, walls: RuinWall[], debris: RuinDebris[], includeDebris: boolean): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a7a88, roughness: 0.9 });
  applyStonePBR(stoneMat);

  for (const p of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, p.h * scale, 0.4 * scale), stoneMat);
    mesh.position.set(p.x * scale, (p.h / 2) * scale, p.z * scale);
    mesh.rotation.x = p.rx;
    mesh.rotation.y = p.ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isCollider = true;
    g.add(mesh);
  }

  if (includeDebris) {
    for (const d of debris) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.size, d.size * 0.5, d.size), stoneMat);
      mesh.position.set(d.px, d.size * 0.25, d.pz);
      mesh.rotation.y = d.ry;
      mesh.castShadow = true;
      mesh.userData.noCollision = true;
      g.add(mesh);
    }
  }
  applyWorldTiling(g, stoneMat);
  return g;
}

export class Ruins extends Mesh {
  static readonly type = 'ruins';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    const walls: RuinWall[] = [
      { x: 0, z: 0, h: 1.8, rx: 0, ry: Math.random() * 0.3 },
      { x: 3, z: 1, h: 1.2, rx: 0.1, ry: Math.random() * 0.3 },
      { x: -2, z: 2, h: 2.2, rx: -0.05, ry: Math.random() * 0.3 },
      { x: 1, z: -3, h: 0.8, rx: 0.08, ry: Math.random() * 0.3 },
    ];
    const debris: RuinDebris[] = Array.from({ length: 6 }, () => ({
      px: (Math.random() - 0.5) * 6 * scale,
      pz: (Math.random() - 0.5) * 6 * scale,
      size: (0.3 + Math.random() * 0.4) * scale,
      ry: Math.random() * Math.PI,
    }));

    lod.addLevel(buildRuinsGroup(scale, walls, debris, true), 0);    // Full (0–160)
    lod.addLevel(buildRuinsGroup(scale, walls, debris, false), 160); // Mid (160+) — walls only
    return lod;
  }
}

registerMesh(Ruins);
