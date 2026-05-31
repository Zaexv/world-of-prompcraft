import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials } from './MalakaKit';

export class MalakaHouseReconstructed extends Mesh {
  static readonly type = 'malaka_house_reconstructed';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const width = 5 * scale;
    const depth = 5 * scale;
    const totalHeight = 5 * scale;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, totalHeight, depth), mats.stucco);
    body.position.y = totalHeight / 2;
    body.userData.isCollider = true;
    g.add(body);
    return g;
  }
}

registerMesh(MalakaHouseReconstructed);
