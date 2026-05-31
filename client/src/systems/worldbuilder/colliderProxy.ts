import * as THREE from 'three';

/**
 * Explicit collision proxies.
 *
 * Instead of colliding the player/NPC capsule against a building's *visual*
 * meshes — which are thin, concave, decorated, and easy to mis-tag — each
 * structure defines a few invisible convex primitives (boxes, cylinders) that
 * approximate its solid footprint. The capsule collides against these.
 *
 * Why this is more reliable:
 *  - Convex + solid: the capsule can't tunnel through a "thin" wall or snag on
 *    a decorative edge; depenetration is well-defined.
 *  - Cheap: a box is 12 triangles vs. hundreds on a detailed mesh.
 *  - Decoupled: render geometry can be optimised or restyled without changing
 *    where the player can walk.
 *
 * A proxy is just a `THREE.Mesh` tagged `userData.isCollider = true` and made
 * invisible, so `CollisionSystem.addCollidableFiltered` registers it (and, once
 * a group has tagged proxies, ignores the render meshes around them).
 */

// Shared material — proxies never render, so one instance is enough.
const PROXY_MATERIAL = new THREE.MeshBasicMaterial();

function makeProxy(geometry: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, PROXY_MATERIAL);
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.isCollider = true;
  return mesh;
}

/** An invisible box collision hitbox (walls, towers, foundations). */
export function boxCollider(width: number, height: number, depth: number): THREE.Mesh {
  return makeProxy(new THREE.BoxGeometry(width, height, depth));
}

/** An invisible vertical-cylinder collision hitbox (round towers, columns). */
export function cylinderCollider(radius: number, height: number, segments = 12): THREE.Mesh {
  return makeProxy(new THREE.CylinderGeometry(radius, radius, height, segments));
}
