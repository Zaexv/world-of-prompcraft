/**
 * BiomeKit — shared material cache and mesh helpers for procedural biome
 * buildings and props.
 *
 * Design principles (preserved from the original biomeProps module):
 *  • flatShading: true on every material — stylized, readable silhouettes
 *  • Max 8–10 mesh pieces per structure to keep draw-calls low
 *  • isCollider:true on solid parts, noCollision:true on decorative/emissive parts
 */

import * as THREE from 'three';

// ── Material cache ────────────────────────────────────────────────────────────

const _cache = new Map<string, THREE.MeshStandardMaterial>();

export function m(
  hex: number,
  rough = 0.82,
  metal = 0,
  emHex?: number,
  emInt?: number,
): THREE.MeshStandardMaterial {
  const key = `${hex}|${rough}|${metal}|${emHex ?? ''}|${emInt ?? ''}`;
  let mat = _cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: hex, roughness: rough, metalness: metal, flatShading: true,
    });
    if (emHex !== undefined) {
      mat.emissive = new THREE.Color(emHex);
      mat.emissiveIntensity = emInt ?? 1;
    }
    _cache.set(key, mat);
  }
  return mat;
}

// ── Mesh helpers ──────────────────────────────────────────────────────────────

type Geo = THREE.BufferGeometry;

export function solid(
  g: THREE.Group,
  geo: Geo,
  mat: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  g.add(mesh);
  return mesh;
}

export function deco(
  g: THREE.Group,
  geo: Geo,
  mat: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.userData.noCollision = true;
  g.add(mesh);
  return mesh;
}
