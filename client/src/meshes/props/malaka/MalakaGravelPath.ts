import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';
import { applyWorldTiling } from '../../buildings/worldTiled';

export class MalakaGravelPath extends Mesh {
  static readonly type = 'malaka_gravel_path';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const pathLen = 8 * scale;
    const pathW = 2.2 * scale;
    
    const gravelMat = new THREE.MeshStandardMaterial({
      color: 0xc9b99a, roughness: 0.95, metalness: 0,
    });
    gravelMat.userData.flatColor = 0xb5a78b;
    
    const path = new THREE.Mesh(new THREE.BoxGeometry(pathW, 0.06 * scale, pathLen), gravelMat);
    path.position.set(0, 0.03 * scale, 0);
    path.receiveShadow = true;
    path.userData.noCollision = true;
    g.add(path);

    applyWorldTiling(g, gravelMat);

    return withLOD(g);
  }
}

registerMesh(MalakaGravelPath);

