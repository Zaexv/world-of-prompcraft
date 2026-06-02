import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { buildProceduralMesh, getPlaceholderAppearance, NPC_Y_HEAD } from '../../../entities/NPCAppearance';

export class ElTito extends Mesh {
  static readonly type = 'npc_individual_el_tito';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    group.name = 'El Tito';

    const appearance = getPlaceholderAppearance('mage');
    // "Special skin": slightly more olive/tan and dark robes
    appearance.headColor = 0xcb9d75; 
    appearance.bodyColor = 0x1a1a1a;
    appearance.hatColor = 0x2a1a3a; // Deep purple hat

    buildProceduralMesh(group, appearance, 'mage');

    // "High quality human textures": Enhance PBR for the head
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name === 'head') {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.45; // More skin-like specular
        mat.metalness = 0.02;
        // The default applyCharacterPBR adds skin normal map, which is good.
      }
    });

    // "Smoke a joint": Add a joint as a mouth accessory
    const jointGroup = new THREE.Group();
    
    // The paper/body
    const paperGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.18, 8);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const paper = new THREE.Mesh(paperGeo, paperMat);
    paper.rotation.x = Math.PI / 2;
    jointGroup.add(paper);

    // The cherry (glowing tip)
    const cherryGeo = new THREE.SphereGeometry(0.014, 8, 8);
    const cherryMat = new THREE.MeshStandardMaterial({ 
      color: 0xff2200, 
      emissive: 0xff1100, 
      emissiveIntensity: 6 
    });
    const cherry = new THREE.Mesh(cherryGeo, cherryMat);
    cherry.position.z = 0.09;
    jointGroup.add(cherry);

    // Position it in the mouth area
    // NPC_Y_HEAD is the center of the head box (0.52 high)
    const mouthY = NPC_Y_HEAD - 0.12;
    const mouthZ = 0.24; // Front of head
    jointGroup.position.set(0.06, mouthY, mouthZ);
    jointGroup.rotation.set(-0.1, 0.4, 0); // Slight angle
    group.add(jointGroup);

    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(ElTito);
