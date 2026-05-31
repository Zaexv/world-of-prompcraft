import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class ForestGrass extends Mesh {
  static readonly type = 'biome_prop_forest_grass';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const s = ctx.scale;
    const g = new THREE.Group();
    g.position.copy(ctx.position);

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.bezierCurveTo(-0.035, 0.16, -0.045, 0.6, -0.01, 1.0);
    bladeShape.bezierCurveTo(0.008, 1.04, 0.025, 1.04, 0.04, 1.0);
    bladeShape.bezierCurveTo(0.045, 0.6, 0.035, 0.16, 0, 0);
    const bladeGeo = new THREE.ShapeGeometry(bladeShape, 3); // Reduced segments for mesh usage

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x5bbf64,
      emissive: new THREE.Color(0x173f22),
      emissiveIntensity: 0.12,
      roughness: 1.0,
      side: THREE.DoubleSide,
    });

    // Create a small cluster of blades to represent one "grass patch"
    const count = 5;
    for (let i = 0; i < count; i++) {
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        const ls = s * (0.8 + Math.random() * 0.4);
        blade.scale.set(ls * 0.8, ls, ls * 0.8);
        blade.position.set((Math.random() - 0.5) * 0.5 * s, 0, (Math.random() - 0.5) * 0.5 * s);
        blade.rotation.y = Math.random() * Math.PI * 2;
        blade.rotation.x = (Math.random() - 0.5) * 0.2;
        blade.rotation.z = (Math.random() - 0.5) * 0.2;
        blade.castShadow = true;
        blade.receiveShadow = true;
        g.add(blade);
    }
    
    g.userData.noCollision = true;
    return g;
  }
}

registerMesh(ForestGrass);
