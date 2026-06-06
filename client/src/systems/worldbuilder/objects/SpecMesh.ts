import * as THREE from 'three';
import type { MeshSpec, MeshSpecPart } from '../../../network/MessageProtocol';

/**
 * Build a brand-new mesh from a primitive spec produced by the server's
 * `create_custom_mesh` tool. Each part becomes a colored MeshStandardMaterial
 * mesh, positioned at its local offset; the whole group is placed at `pos`.
 *
 * This is the "generate new meshes by prompting" path: shapes the catalog
 * doesn't have are composed at runtime instead of falling back to a marker.
 */
export function buildSpecMesh(spec: MeshSpec, pos: THREE.Vector3, scale: number): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.scale.setScalar(scale);

  for (const part of spec.parts ?? []) {
    const mesh = buildPart(part);
    if (mesh) group.add(mesh);
  }

  return group;
}

function buildPart(part: MeshSpecPart): THREE.Mesh | null {
  const geometry = buildGeometry(part);
  if (!geometry) return null;

  const color = parseColor(part.color);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
  const mesh = new THREE.Mesh(geometry, material);

  const [px, py, pz] = part.position ?? [0, 0, 0];
  mesh.position.set(px, py, pz);

  if (part.rotation) {
    mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildGeometry(part: MeshSpecPart): THREE.BufferGeometry | null {
  const s = part.size ?? [1, 1, 1];
  switch (part.shape) {
    case 'box':
      return new THREE.BoxGeometry(num(s[0], 1), num(s[1], 1), num(s[2], 1));
    case 'cylinder':
      // [radius, height, radius] — third value tolerated but unused.
      return new THREE.CylinderGeometry(num(s[0], 0.5), num(s[0], 0.5), num(s[1], 1), 16);
    case 'cone':
      return new THREE.ConeGeometry(num(s[0], 0.5), num(s[1], 1), 16);
    case 'pyramid':
      // A 4-sided cone reads as a pyramid.
      return new THREE.ConeGeometry(num(s[0], 0.5), num(s[1], 1), 4);
    case 'sphere':
      return new THREE.SphereGeometry(num(s[0], 0.5), 16, 12);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseColor(color: string | undefined): THREE.Color {
  try {
    return new THREE.Color(color ?? '#aaaaaa');
  } catch {
    return new THREE.Color('#aaaaaa');
  }
}
