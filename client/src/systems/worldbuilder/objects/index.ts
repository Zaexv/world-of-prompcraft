import * as THREE from 'three';
import { buildMesh } from '../../../meshes';
import type { MeshSpec } from '../../../network/MessageProtocol';
import { buildSpecMesh } from './SpecMesh';

export type ObjectType =
  | 'moonwell' | 'tower' | 'ruins' | 'altar' | 'runic_stone' | 'wooden_fence' | 'pavilion' | 'portal_arch'
  | 'malaka_house' | 'malaka_house_reconstructed' | 'malaka_ermita' | 'malaka_patio_house' | 'malaka_cortijo' | 'malaka_farm' | 'malaka_bodega' | 'malaka_church' | 'malaka_castle' | 'malaka_wall' | 'malaka_tower' | 'roman_amphitheatre' | 'road'
  | 'mushroom_cluster' | 'ancient_tree' | 'crystal_cluster'
  | 'campfire' | 'bonfire' | 'lantern';

export function buildObject(
  type: string,
  pos: THREE.Vector3,
  scale: number,
  label?: string,
  spec?: MeshSpec,
): THREE.Object3D {
  // Generative meshes ("custom") carry a primitive spec and are built at runtime
  // rather than looked up in the catalog.
  if (spec && spec.parts?.length) {
    return buildSpecMesh(spec, pos, scale);
  }

  // Every placeable mesh is registered in the catalog. Unknown types fall back to
  // a visible marker so missing data is obvious in-world.
  const registered = buildMesh(type, { position: pos, scale, label });
  if (registered) return registered;

  return buildDefaultMarker(pos, scale, label ?? type);
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
