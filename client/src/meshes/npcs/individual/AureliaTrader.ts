import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { buildProceduralMesh, getPlaceholderAppearance } from '../../../entities/NPCAppearance';
import { addPlaceholderAccessory } from '../../../entities/NPCAccessories';

export class AureliaTrader extends Mesh {
  static readonly type = 'npc_individual_merchant_malaka_01';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'Aurelia the Trader'; // Seed for variety

    const appearance = getPlaceholderAppearance('merchant');
    buildProceduralMesh(group, appearance, 'merchant');
    addPlaceholderAccessory(group, 'merchant');

    // Unique Aurelia Additions: Large Golden Satchel
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
    const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.2), goldMat);
    satchel.position.set(0.3, 1.2, 0.1);
    satchel.rotation.z = 0.2;
    group.add(satchel);

    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(AureliaTrader);
