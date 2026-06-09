import * as THREE from 'three';
import { buildMesh } from '../../meshes/core/MeshRegistry';
import { boxCollider } from './colliderProxy';
import type { Rng } from './RngTypes';

/** One placement of an instanceable mesh within a chunk. */
export interface VegInstance {
  pos: THREE.Vector3;
  scale: number;
  rotationY: number;
}

export interface InstancedBatch {
  /** Visible InstancedMeshes (one per template material) to add + track. */
  objects: THREE.Object3D[];
  /** Invisible per-instance colliders, grouped; null if the type doesn't collide. */
  colliders: THREE.Group | null;
}

const _m = new THREE.Matrix4();
const _dummy = new THREE.Object3D();
const _off = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Collapse every placement of an `instanceable` mesh type in a chunk into one
 * `InstancedMesh` per material — N trees become ~2 draws instead of 2·N. Only
 * valid for types whose geometry is identical per placement (pos/rot/scale are
 * the only per-instance variation); the populator gates on `isInstanceable`.
 *
 * A throwaway template is built once and merged (buildMesh merges vegetation),
 * its LOD level-0 meshes are reused as instanced geometry, and each
 * `isCollider` template mesh becomes a per-instance box collider so collision is
 * unchanged. (Per-instance LOD is dropped — instanced trees are small and the
 * chunk load radius keeps them near; tris are not the bottleneck, draws were.)
 */
export function buildInstancedBatch(
  type: string,
  instances: VegInstance[],
  rng: Rng,
): InstancedBatch | null {
  if (instances.length === 0) return null;

  const template = buildMesh(type, { position: new THREE.Vector3(), scale: 1, rng });
  if (!template) return null;

  // Resolve the detail group to instance, and dispose any unused LOD geometry.
  let group: THREE.Group | null = null;
  if (template instanceof THREE.LOD) {
    const lvl0 = template.levels[0]?.object;
    if (lvl0 instanceof THREE.Group) group = lvl0;
    for (let i = 1; i < template.levels.length; i++) {
      template.levels[i]?.object.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
  } else if (template instanceof THREE.Group) {
    group = template;
  }
  if (!group) return null;
  group.updateMatrixWorld(true);

  // Collect template meshes (post-merge: a couple per type). Skip instanced/
  // skinned/multi-material — none expected here, but stay defensive.
  const templ: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      !(o instanceof THREE.InstancedMesh) &&
      !(o instanceof THREE.SkinnedMesh) &&
      !Array.isArray(o.material)
    ) {
      templ.push(o);
    }
  });
  if (templ.length === 0) return null;

  const count = instances.length;
  const objects: THREE.Object3D[] = [];
  const colliderGroup = new THREE.Group();

  // Bounding-sphere centre = mean instance position (instanced mesh sits at the
  // origin, so its geometry boundingSphere is expressed in world coordinates).
  const center = new THREE.Vector3();
  for (const it of instances) center.add(it.pos);
  center.multiplyScalar(1 / count);
  let maxDist = 0;
  for (const it of instances) maxDist = Math.max(maxDist, it.pos.distanceTo(center));

  let maxInstRadius = 0;

  for (const mesh of templ) {
    const geo = mesh.geometry;
    mesh.updateMatrix();

    const inst = new THREE.InstancedMesh(geo, mesh.material as THREE.Material, count);
    inst.castShadow = mesh.castShadow;
    inst.receiveShadow = mesh.receiveShadow;
    inst.userData.noCollision = true; // visible geometry; colliders are separate

    for (let i = 0; i < count; i++) {
      const it = instances[i]!;
      _dummy.position.copy(it.pos);
      _dummy.rotation.set(0, it.rotationY, 0);
      _dummy.scale.setScalar(it.scale);
      _dummy.updateMatrix();
      _m.multiplyMatrices(_dummy.matrix, mesh.matrix);
      inst.setMatrixAt(i, _m);
    }
    inst.instanceMatrix.needsUpdate = true;
    objects.push(inst);

    geo.computeBoundingSphere();
    const r = geo.boundingSphere?.radius ?? 0;
    for (const it of instances) maxInstRadius = Math.max(maxInstRadius, r * it.scale);

    // Per-instance collider from the template's collider meshes.
    if (mesh.userData.isCollider === true) {
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (bb) {
        const size = new THREE.Vector3();
        const c = new THREE.Vector3();
        bb.getSize(size);
        bb.getCenter(c);
        for (const it of instances) {
          const col = boxCollider(size.x * it.scale, size.y * it.scale, size.z * it.scale);
          _off.copy(c).multiplyScalar(it.scale).applyAxisAngle(UP, it.rotationY);
          col.position.copy(it.pos).add(_off);
          col.rotation.y = it.rotationY;
          colliderGroup.add(col);
        }
      }
    }
  }

  // Expand each instanced geometry's bounding sphere to span the whole chunk of
  // instances, so frustum culling works at chunk granularity (mesh is at origin).
  const sphere = new THREE.Sphere(center, maxDist + maxInstRadius);
  for (const inst of objects) {
    if (inst instanceof THREE.InstancedMesh) inst.geometry.boundingSphere = sphere.clone();
  }

  return { objects, colliders: colliderGroup.children.length > 0 ? colliderGroup : null };
}
