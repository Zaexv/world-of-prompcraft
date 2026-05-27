import * as THREE from 'three';
import * as structures from './structures';
import * as vegetation from './vegetation';
import * as furniture from './furniture';

export type ObjectType = 
  | 'moonwell' | 'tower' | 'ruins' | 'altar' | 'runic_stone' | 'wooden_fence' | 'pavilion' | 'portal_arch'
  | 'malaka_house' | 'malaka_church' | 'malaka_castle' | 'roman_amphitheatre' | 'road'
  | 'mushroom_cluster' | 'ancient_tree' | 'crystal_cluster'
  | 'campfire' | 'bonfire' | 'lantern';

export function buildObject(type: string, pos: THREE.Vector3, scale: number, label?: string): THREE.Group {
  switch (type) {
    case 'moonwell': return structures.buildMoonwell(pos, scale);
    case 'tower': return structures.buildTower(pos, scale);
    case 'ruins': return structures.buildRuins(pos, scale);
    case 'altar': return structures.buildAltar(pos, scale);
    case 'runic_stone': return structures.buildRunicStone(pos, scale);
    case 'wooden_fence': return structures.buildWoodenFence(pos, scale);
    case 'pavilion': return structures.buildPavilion(pos, scale);
    case 'portal_arch': return structures.buildPortalArch(pos, scale);
    case 'malaka_house': return structures.buildMalakaHouse(pos, scale);
    case 'malaka_church': return structures.buildMalakaChurch(pos, scale);
    case 'malaka_castle': return structures.buildMalakaCastle(pos, scale);
    case 'roman_amphitheatre': return structures.buildRomanAmphitheatre(pos, scale);
    case 'road': return structures.buildRoad(pos, scale);
    
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

function buildDefaultMarker(pos: THREE.Vector3, scale: number, _label: string): THREE.Group {
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
