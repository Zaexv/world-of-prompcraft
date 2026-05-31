import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class DesertRock extends Mesh {
  static readonly type = 'biome_prop_desert_rock';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Mesh {
    const s = ctx.scale;
    
    const rockGeo = new THREE.DodecahedronGeometry(0.8 * s, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x8d7a62,
      roughness: 1.0,
      metalness: 0.0,
    });

    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.copy(ctx.position);
    // Rocks usually rest a bit into the ground
    rock.position.y += 0.4 * s; 
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.userData.isCollider = true;
    
    return rock;
  }
}

registerMesh(DesertRock);
