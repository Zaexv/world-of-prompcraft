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

  const mesh = new THREE.Mesh(geometry, buildMaterial(part));

  const [px, py, pz] = part.position ?? [0, 0, 0];
  mesh.position.set(px, py, pz);

  if (part.rotation) {
    mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildMaterial(part: MeshSpecPart): THREE.MeshStandardMaterial {
  const color = parseColor(part.color);
  switch (part.mat) {
    case 'metal':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.9 });
    case 'glow':
      return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.2,
        roughness: 0.6,
        metalness: 0.0,
      });
    case 'glass':
      return new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        roughness: 0.15,
        metalness: 0.1,
      });
    default:
      return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
  }
}

function buildGeometry(part: MeshSpecPart): THREE.BufferGeometry | null {
  const geometry = buildBaseGeometry(part);
  // Baked into the geometry so part.rotation still composes freely on the mesh.
  if (part.axis === 'x') geometry.rotateZ(Math.PI / 2);
  else if (part.axis === 'z') geometry.rotateX(Math.PI / 2);
  return geometry;
}

function buildBaseGeometry(part: MeshSpecPart): THREE.BufferGeometry {
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
    case 'sphere': {
      // [r] = sphere; unequal [rx, ry, rz] = ellipsoid (organic bodies/heads).
      const rx = num(s[0], 0.5);
      const ry = num(s[1], rx);
      const rz = num(s[2], rx);
      const geo = new THREE.SphereGeometry(1, 16, 12);
      geo.scale(rx, ry, rz);
      return geo;
    }
    case 'capsule': {
      // [radius, total_height] — CapsuleGeometry's length is the mid-section
      // only, so subtract the two hemisphere caps from the requested height.
      const radius = num(s[0], 0.3);
      const height = num(s[1], radius * 3);
      return new THREE.CapsuleGeometry(radius, Math.max(height - 2 * radius, 0.01), 4, 12);
    }
    case 'torus':
      // [radius, tube_radius]
      return new THREE.TorusGeometry(num(s[0], 0.5), num(s[1], num(s[0], 0.5) * 0.3), 12, 24);
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
