import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';
import { cylinderCollider } from '../../../systems/worldbuilder/colliderProxy';

export class MalakaWell extends Mesh {
  static readonly type = 'malaka_well';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const wellBaseMat = mats.stone;
    const wellR = 0.8 * scale;
    const wellH = 0.9 * scale;
    
    // Stone cylinder
    const wellWall = new THREE.Mesh(
      new THREE.CylinderGeometry(wellR, wellR + 0.05 * scale, wellH, 12, 1, true),
      wellBaseMat,
    );
    wellWall.position.set(0, wellH / 2, 0);
    wellWall.castShadow = true;
    wellWall.userData.noCollision = true;
    g.add(wellWall);
    
    // Cap ring
    const wellCap = new THREE.Mesh(
      new THREE.TorusGeometry(wellR, 0.1 * scale, 6, 16), wellBaseMat,
    );
    wellCap.rotation.x = -Math.PI / 2;
    wellCap.position.set(0, wellH, 0);
    wellCap.userData.noCollision = true;
    g.add(wellCap);
    
    // Water inside
    const wellWater = new THREE.MeshStandardMaterial({
      color: 0x2c6e8a, metalness: 0.5, roughness: 0.2, transparent: true, opacity: 0.7,
    });
    const waterDisc = new THREE.Mesh(
      new THREE.CircleGeometry(wellR - 0.1 * scale, 12), wellWater,
    );
    waterDisc.rotation.x = -Math.PI / 2;
    waterDisc.position.set(0, wellH * 0.4, 0);
    waterDisc.userData.noCollision = true;
    g.add(waterDisc);
    
    // Support posts + crossbar
    const postH = 1.8 * scale;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 * scale, postH, 0.1 * scale), mats.wood,
      );
      post.position.set(sx * wellR * 0.7, wellH + postH / 2, 0);
      post.castShadow = true;
      post.userData.noCollision = true;
      g.add(post);
    }
    const crossbar = new THREE.Mesh(
      new THREE.BoxGeometry(wellR * 1.6, 0.1 * scale, 0.1 * scale), mats.wood,
    );
    crossbar.position.set(0, wellH + postH, 0);
    crossbar.userData.noCollision = true;
    g.add(crossbar);
    
    // Well collider
    const wellColl = cylinderCollider(wellR + 0.1 * scale, wellH + postH, 8);
    wellColl.position.set(0, (wellH + postH) / 2, 0);
    g.add(wellColl);

    return withLOD(g);
  }
}

registerMesh(MalakaWell);

