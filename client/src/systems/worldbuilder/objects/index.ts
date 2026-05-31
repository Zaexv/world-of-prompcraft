import * as THREE from 'three';
import * as vegetation from './vegetation';
import * as furniture from './furniture';
import { buildMesh } from '../../../meshes';

export type ObjectType =
  | 'moonwell' | 'tower' | 'ruins' | 'altar' | 'runic_stone' | 'wooden_fence' | 'pavilion' | 'portal_arch'
  | 'malaka_house' | 'malaka_house_reconstructed' | 'malaka_ermita' | 'malaka_patio_house' | 'malaka_cortijo' | 'malaka_bodega' | 'malaka_church' | 'malaka_castle' | 'malaka_wall' | 'malaka_tower' | 'roman_amphitheatre' | 'road'
  | 'mushroom_cluster' | 'ancient_tree' | 'crystal_cluster'
  | 'campfire' | 'bonfire' | 'lantern';

export function buildObject(type: string, pos: THREE.Vector3, scale: number, label?: string): THREE.Object3D {
  // Registry-driven meshes (buildings/structures) take precedence. Anything not
  // yet migrated falls through to the legacy switch below.
  const registered = buildMesh(type, { position: pos, scale, label });
  if (registered) return registered;

  switch (type) {
    case 'mushroom_cluster': return vegetation.buildMushroomCluster(pos, scale);
    case 'ancient_tree': 
    case 'ancient_tree_cluster':
    case 'tree':
    case 'pine': return vegetation.buildAncientTree(pos, scale);
    case 'crystal_cluster': return vegetation.buildCrystalCluster(pos, scale);
    
    case 'campfire': return furniture.buildCampfire(pos, scale);
    case 'bonfire': return furniture.buildBonfire(pos, scale);
    case 'lantern': return furniture.buildLantern(pos, scale);
    
    default: return buildDefaultMarker(pos, scale, label ?? type);
  }
}

function buildDefaultMarker(pos: THREE.Vector3, scale: number, _label: string): THREE.Object3D {
  const g = new THREE.Group();
  g.position.copy(pos);

  const geo = new THREE.SphereGeometry(0.4 * scale, 8, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: new THREE.Color(0xff6600),
    emissiveIntensity: 0.8,
  });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.y = 0.4 * scale;
  sphere.userData.noCollision = true;
  g.add(sphere);

  return g;
}
