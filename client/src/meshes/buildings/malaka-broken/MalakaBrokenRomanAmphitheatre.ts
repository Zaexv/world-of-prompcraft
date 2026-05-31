import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from './MalakaBrokenKit';
import { cylinderCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenRomanAmphitheatre extends Mesh {
  static readonly type = 'malaka_broken_roman_amphitheatre';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // 0. Foundation Plinth
    const innerR = 4.0 * scale;
    const plinthH = 0.5 * scale;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(innerR + 0.2 * scale, innerR + 0.2 * scale, plinthH, 48), mats.stone);
    plinth.position.y = plinthH / 2 - 0.1 * scale;
    g.add(plinth);

    const orch = new THREE.Mesh(new THREE.CylinderGeometry(innerR, innerR, 0.3 * scale, 48, 1, false, Math.PI, Math.PI), mats.stone);
    orch.position.y = plinthH + 0.15 * scale - 0.1 * scale;
    g.add(orch);

    // The orchestra floor renders as a half-disc; the collider is a clean full
    // low cylinder so the capsule never snags on the open arc edges.
    const orchProxy = cylinderCollider(innerR, 0.3 * scale + plinthH);
    orchProxy.position.y = (0.3 * scale + plinthH) / 2 - 0.1 * scale;
    g.add(orchProxy);

    applyWorldTiling(g, mats.stone);
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenRomanAmphitheatre);
