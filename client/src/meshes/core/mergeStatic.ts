import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collapse a static building group's opaque geometry into one mesh per
 * (material × collision-tag × shadow-flags) bucket.
 *
 * Promptcraft buildings are authored as dozens-to-hundreds of tiny sub-meshes
 * (every brick, tile, stud is its own `THREE.Mesh`). At ~30 triangles per draw
 * that makes the renderer CPU/draw-call bound long before it is geometry bound —
 * a village pushed draws past 5000 and froze an RTX 5080 to <60 fps while
 * pushing only ~170k triangles. Merging by material keeps the exact triangles
 * (openings, silhouettes unchanged) but turns a 71-mesh church into ~6 draws,
 * and halves the shadow pass with it.
 *
 * Run on the full-detail group BEFORE it is wrapped in LOD, in local space
 * (group still at the origin) so every LOD level inherits the merge.
 *
 * Collision is preserved EXACTLY: each mesh's collision tag (isCollider /
 * noCollision / untagged) is carried onto its merged result, so
 * CollisionSystem.addCollidableFiltered sees the identical tagged/fallback set
 * (merged geometry keeps every triangle, so the BVH surface is unchanged — just
 * far fewer bodies).
 *
 * Left UNMERGED (re-parented to the root with their world transform baked in):
 *   - invisible meshes (`visible === false`) — collider proxies; 0 draws anyway
 *   - transparent meshes (glass, glow orbs) — merging breaks blend sorting
 *   - multi-material meshes (e.g. the studded door) — can't bucket by one material
 *   - non-mesh nodes: light-emitter markers (PointLightPool), sprites, nested LODs
 *   - anything tagged `userData.noMerge`
 */
export interface MergeOptions {
  /**
   * How to group materials into one draw. Default = by material instance
   * (`uuid`), correct when meshes SHARE cached materials (buildings/kits). For
   * meshes that create a fresh material per part (NPC rigs via `vmat`), pass a
   * property signature so visually-identical materials still merge — the bucket
   * keeps the first material as representative, so all members must look the same.
   */
  materialKey?: (m: THREE.Material) => string;
}

export function mergeStaticByMaterial(root: THREE.Group, opts: MergeOptions = {}): void {
  const matKey = opts.materialKey ?? ((m: THREE.Material): string => m.uuid);
  root.updateMatrixWorld(true);
  // Bake into the root's LOCAL frame, not world: a mesh's root-local matrix is
  // root.matrixWorld⁻¹ · mesh.matrixWorld. This keeps the root's own transform
  // applied exactly once — props are merged by buildMesh while already
  // positioned (g.position = pos), so baking world matrices would double the
  // offset and float them. (When called from withLOD the root is at the origin,
  // so this reduces to the identity and changes nothing there.)
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const localOf = (o: THREE.Object3D): THREE.Matrix4 =>
    new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);

  type Tag = 'C' | 'N' | 'D'; // isCollider | noCollision | default(fallback)
  interface Bucket {
    mat: THREE.Material;
    tag: Tag;
    cast: boolean;
    recv: boolean;
    geos: THREE.BufferGeometry[];
  }
  const buckets = new Map<string, Bucket>();
  const mergedOriginals: { mesh: THREE.Mesh; key: string }[] = []; // disposed after merge
  const preserve: { obj: THREE.Object3D; matrix: THREE.Matrix4 }[] = [];

  root.traverse((o) => {
    if (o === root) return;

    if (o instanceof THREE.Mesh) {
      const mat = o.material;
      const single = !Array.isArray(mat) ? mat : null;
      // InstancedMesh/SkinnedMesh extend Mesh but carry per-instance / skinning
      // state that baking geometry would destroy — never merge them.
      const plainMesh =
        !(o instanceof THREE.InstancedMesh) && !(o instanceof THREE.SkinnedMesh);
      const mergeable =
        plainMesh &&
        single !== null &&
        o.visible !== false &&
        single.transparent !== true &&
        o.userData.noMerge !== true;

      if (mergeable && single) {
        const tag: Tag =
          o.userData.isCollider === true ? 'C' : o.userData.noCollision === true ? 'N' : 'D';
        const key = `${matKey(single)}|${tag}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
        let b = buckets.get(key);
        if (!b) {
          b = { mat: single, tag, cast: o.castShadow, recv: o.receiveShadow, geos: [] };
          buckets.set(key, b);
        }
        let geo = o.geometry.clone().applyMatrix4(localOf(o));
        if (geo.index) {
          const ni = geo.toNonIndexed();
          geo.dispose();
          geo = ni;
        }
        normalizeAttrs(geo);
        b.geos.push(geo);
        mergedOriginals.push({ mesh: o, key });
        return;
      }

      // Non-mergeable mesh (proxy / transparent / multi-material / instanced /
      // skinned) — keep as-is.
      preserve.push({ obj: o, matrix: localOf(o) });
      return;
    }

    // Non-mesh node. Drop only plain Group containers — their renderable
    // descendants are merged or preserved individually by this same traversal.
    // Keep EVERYTHING else that renders or carries meaning: Points (fire/dust
    // particles with onBeforeRender), Sprites, Lines, light-emitter markers,
    // nested LODs/Lights. Whitelisting would silently delete the rest.
    if (!(o instanceof THREE.Group)) {
      preserve.push({ obj: o, matrix: localOf(o) });
    }
  });

  if (buckets.size === 0) return; // nothing opaque to merge — leave as-is

  const merged: THREE.Mesh[] = [];
  const okKeys = new Set<string>();
  for (const [key, b] of buckets) {
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!geo) continue; // attribute mismatch slipped through — skip (normalizeAttrs makes this rare)
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    if (b.tag === 'C') mesh.userData.isCollider = true;
    else if (b.tag === 'N') mesh.userData.noCollision = true;
    merged.push(mesh);
    okKeys.add(key);
  }

  // Dispose originals whose bucket merged; for any bucket that failed, keep its
  // originals (re-parent them) so no geometry is lost.
  for (const { mesh, key } of mergedOriginals) {
    if (okKeys.has(key)) mesh.geometry.dispose();
    else preserve.push({ obj: mesh, matrix: localOf(mesh) });
  }

  for (const p of preserve) p.obj.removeFromParent();
  root.clear();

  for (const mesh of merged) root.add(mesh);
  for (const p of preserve) {
    p.matrix.decompose(p.obj.position, p.obj.quaternion, p.obj.scale);
    p.obj.matrixAutoUpdate = true;
    root.add(p.obj);
  }
  root.userData.merged = true; // so callers don't re-merge an already-merged group
}

/**
 * Reduce a geometry to position + normal + uv so every geo in a bucket shares an
 * identical attribute set — `mergeGeometries` requires that. Extra channels
 * (uv2/color/tangent) are dropped; Promptcraft PBR materials only sample the
 * `uv` channel, so this is lossless for them.
 */
function normalizeAttrs(geo: THREE.BufferGeometry): void {
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') {
      geo.deleteAttribute(name);
    }
  }
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) {
    const count = geo.getAttribute('position').count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
}
