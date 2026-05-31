import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh, buildMesh } from '../../core/MeshRegistry';

export class ForestSanctuary extends Mesh {
  static readonly type = 'biome_forest_sanctuary';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    // Create a large ground ring (rock) to act as the sanctuary base
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x7b725f,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.88,
      depthWrite: false, // matches the Water transparency fix on main
    });
    // Radius ~ 18 * scale
    const ring = new THREE.Mesh(new THREE.CircleGeometry(18 * scale, 36), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.userData.noCollision = true;
    ring.receiveShadow = true;
    g.add(ring);

    // Add Moonwell
    const moonwell = buildMesh('moonwell', {
      position: new THREE.Vector3(-8 * scale, 0, 6 * scale),
      scale: scale,
    });
    if (moonwell) {
      g.add(moonwell);
    }

    // Add Pavilion (Temple)
    const temple = buildMesh('pavilion', {
      position: new THREE.Vector3(12 * scale, 0, -6 * scale),
      scale: scale,
    });
    if (temple) {
      temple.rotation.y = Math.PI * 0.25;
      g.add(temple);
    }

    // Add 2 bonfires on the edges of the ring
    for (let i = 0; i < 2; i++) {
      const angle = (i / 2) * Math.PI * 2;
      const dist = 14 * scale;
      const fire = buildMesh('bonfire', {
        position: new THREE.Vector3(
          Math.cos(angle) * dist,
          0,
          Math.sin(angle) * dist,
        ),
        scale: scale * 0.75,
      });
      if (fire) {
        fire.rotation.y = angle;
        g.add(fire);
      }
    }

    return g;
  }
}

registerMesh(ForestSanctuary);
