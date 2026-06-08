import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';

let _trunkMat: THREE.MeshStandardMaterial | null = null;
let _leafMat: THREE.MeshStandardMaterial | null = null;

function getTrunkMat() {
  if (!_trunkMat) {
    _trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4e31, roughness: 0.9 });
  }
  return _trunkMat;
}

function getLeafMat() {
  if (!_leafMat) {
    _leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8, side: THREE.DoubleSide });
  }
  return _leafMat;
}

function buildTreeGroup(pos: THREE.Vector3, scale: number, segs: number, leafCount: number, castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  
  const trunkMat = getTrunkMat();
  const leafMat = getLeafMat();

  const seed = Math.abs(pos.x * 100 + pos.z * 100) || 1;
  const pseudoRand = (function() {
     let t = seed;
     return function() { t = (t * 16807) % 2147483647; return (t - 1) / 2147483646; };
  })();

  const tH = 8 * scale;
  const bendX = (pseudoRand() - 0.5) * 4 * scale;
  const bendZ = (pseudoRand() - 0.5) * 4 * scale;
  
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bendX * 0.5, tH * 0.5, bendZ * 0.5),
    new THREE.Vector3(bendX, tH, bendZ)
  );

  const trunkGeo = new THREE.TubeGeometry(curve, Math.max(2, segs), 0.3 * scale, segs, false);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = castShadow;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  const endPoint = curve.getPoint(1);

  const crown = new THREE.Group();
  crown.position.copy(endPoint);

  // Leaves
  for (let i = 0; i < leafCount; i++) {
    const angle = (i * Math.PI * 2) / leafCount;
    
    const leafGroup = new THREE.Group();
    leafGroup.rotation.y = angle;
    
    const leafLen = 1.8 * scale;
    for (let s = 0; s < 3; s++) {
      const segGeo = new THREE.PlaneGeometry(0.8 * scale, leafLen);
      const seg = new THREE.Mesh(segGeo, leafMat);
      seg.rotation.x = -Math.PI / 4 - (s * 0.25);
      seg.position.z = s * (leafLen * 0.8);
      seg.position.y = -s * (leafLen * 0.3);
      seg.castShadow = castShadow;
      seg.userData.noCollision = true;
      leafGroup.add(seg);
    }
    crown.add(leafGroup);
  }

  const nutMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 1.0 });
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.25 * scale, 8, 8), nutMat);
    nut.position.set(
      (pseudoRand() - 0.5) * scale,
      -0.2 * scale,
      (pseudoRand() - 0.5) * scale
    );
    crown.add(nut);
  }

  g.add(crown);
  return g;
}

export class MalakaPalmTree extends Mesh {
  static readonly type = 'malaka_palmtree';
  static readonly category = 'vegetation' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    lod.addLevel(buildTreeGroup(pos, scale, 8, 12, true), 0);
    lod.addLevel(buildTreeGroup(pos, scale, 5, 8, true), 180);
    lod.addLevel(buildTreeGroup(pos, scale, 4, 5, false), 360);

    return lod;
  }
}

registerMesh(MalakaPalmTree);
