import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';
import { addLightEmitter } from '../../../scene/PointLightPool';

export class MalakaTerracottaLantern extends Mesh {
  static readonly type = 'malaka_terracotta_lantern';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xb85c38, roughness: 0.8 });
    const lanternGlow = new THREE.MeshStandardMaterial({
      color: 0xffa500, emissive: 0xff8c00, emissiveIntensity: 1.5, transparent: true, opacity: 0.7,
    });
    
    // Base
    const lBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15 * scale, 0.18 * scale, 0.6 * scale, 8), lanternMat,
    );
    lBase.position.set(0, 0.3 * scale, 0);
    lBase.castShadow = true;
    lBase.userData.noCollision = true;
    g.add(lBase);
    
    // Glow orb
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 8, 8), lanternGlow);
    glow.position.set(0, 0.65 * scale, 0);
    glow.userData.noCollision = true;
    g.add(glow);
    
    // Point light — routed through the fixed PointLightPool so streaming
    // lanterns never change numPointLights (which would recompile every shader).
    addLightEmitter(g, new THREE.Vector3(0, 0.7 * scale, 0), {
      color: 0xffa040, intensity: 0.8, distance: 6 * scale, decay: 2,
    });

    return withLOD(g);
  }
}

registerMesh(MalakaTerracottaLantern);

