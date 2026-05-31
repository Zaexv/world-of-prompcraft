import * as THREE from 'three';

/**
 * World-scaled texture tiling for building meshes.
 *
 * A primitive geometry maps its UVs 0→1 regardless of the mesh's real size, so a
 * shared fixed-repeat material puts the same number of stone courses on a tiny
 * cornice and a 16 m castle tier — the larger (or non-square) meshes look
 * stretched. These helpers instead drive tiling from the geometry UVs in *world
 * units*, at a constant texel density, so blocks/tiles stay the same physical
 * size on every surface — as if cut to fit the building — whatever its shape:
 * boxes (incl. thin/diagonal walls), cylinders/cones, spheres, tori and planes.
 *
 * The mesh's own scale is folded in, so a stretched primitive (e.g. the church's
 * nave roof: an 8-sided cone scaled 5× along its axis) still tiles consistently
 * instead of smearing the texture along the stretched direction.
 *
 * Density is fractional (not rounded to whole tiles): keeping the tile size
 * uniform matters more than aligning a seam to each face edge, and the maps are
 * seamless so partial tiles at edges read naturally.
 */

const DEFAULT_UNITS_PER_TILE = 2.2; // ~one course every 2.2 world units
const TWO_PI = Math.PI * 2;

const _tiledCache = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
const _processed = new WeakSet<THREE.BufferGeometry>();

function clone1x1(tex: THREE.Texture | null): THREE.Texture | null {
  if (!tex) return null;
  const t = tex.clone();
  t.repeat.set(1, 1);
  t.needsUpdate = true;
  return t;
}


/**
 * A cached clone of `base` whose maps tile 1×1, so all tiling is driven by the
 * geometry UVs (one material instance serves surfaces of every size).
 */
export function worldTiledMaterial(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const cached = _tiledCache.get(base);
  if (cached) return cached;
  const m = base.clone();
  m.map = clone1x1(base.map);
  m.normalMap = clone1x1(base.normalMap);
  m.roughnessMap = clone1x1(base.roughnessMap);
  m.aoMap = clone1x1(base.aoMap);
  // Carry the flat-color hint through so distance LODs can swap in a matching
  // solid color (see MalakaKit.flatVariant).
  m.userData.flatColor = base.userData.flatColor;
  m.needsUpdate = true;
  _tiledCache.set(base, m);
  return m;
}

/** Multiply every UV in the geometry by (uScale, vScale). */
function scaleAllUVs(geo: THREE.BufferGeometry, uScale: number, vScale: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  }
  uv.needsUpdate = true;
}

/** Per-face UV scaling for a plain (un-segmented) BoxGeometry — each face by its own world span. */
function tileBox(geo: THREE.BoxGeometry, unitsPerTile: number, s: THREE.Vector3): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv || uv.count !== 24) return; // only plain boxes: 4 verts × 6 faces
  const w = geo.parameters.width * s.x;
  const h = geo.parameters.height * s.y;
  const d = geo.parameters.depth * s.z;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z. Each face's U/V axes span:
  const faceSpan: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const uScale = faceSpan[f][0] / unitsPerTile;
    const vScale = faceSpan[f][1] / unitsPerTile;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * uScale, uv.getY(idx) * vScale);
    }
  }
  uv.needsUpdate = true;
}

/** Rewrite a geometry's UVs so its texture tiles at a constant world-scale density. */
function tileGeometryWorld(geo: THREE.BufferGeometry, unitsPerTile: number, s: THREE.Vector3): void {
  const horiz = (s.x + s.z) / 2; // radius/circumference scale (assumes near-uniform X/Z)
  if (geo instanceof THREE.BoxGeometry) {
    tileBox(geo, unitsPerTile, s);
  } else if (geo instanceof THREE.CylinderGeometry) {
    // Also catches ConeGeometry (radiusTop = 0). U wraps the circumference, V spans height.
    const p = geo.parameters;
    const avgR = ((p.radiusTop + p.radiusBottom) / 2) * horiz;
    const circumference = (p.thetaLength ?? TWO_PI) * avgR;
    scaleAllUVs(geo, circumference / unitsPerTile, (p.height * s.y) / unitsPerTile);
  } else if (geo instanceof THREE.SphereGeometry) {
    // U wraps longitude, V runs pole-to-pole.
    const p = geo.parameters;
    const uLen = (p.phiLength ?? TWO_PI) * p.radius * horiz;
    const vLen = (p.thetaLength ?? Math.PI) * p.radius * s.y;
    scaleAllUVs(geo, uLen / unitsPerTile, vLen / unitsPerTile);
  } else if (geo instanceof THREE.TorusGeometry) {
    const p = geo.parameters;
    scaleAllUVs(geo, ((p.arc ?? TWO_PI) * p.radius * horiz) / unitsPerTile, (TWO_PI * p.tube) / unitsPerTile);
  } else if (geo instanceof THREE.PlaneGeometry) {
    const p = geo.parameters;
    scaleAllUVs(geo, (p.width * s.x) / unitsPerTile, (p.height * s.y) / unitsPerTile);
  }
}

/**
 * Fix stretched/inconsistent texturing across a built structure: for every mesh
 * whose material is exactly `targetMaterial`, rewrite its UVs to a constant
 * world-scale tile size (folding in the mesh's own scale) and swap in a 1×1 clone
 * of the material. Handles boxes (incl. thin/diagonal walls), cylinders/cones,
 * spheres, tori and planes. Other materials are left untouched, so you can target
 * just the stone, or just the roof.
 */
export function applyWorldTiling(
  root: THREE.Object3D,
  targetMaterial: THREE.MeshStandardMaterial,
  unitsPerTile = DEFAULT_UNITS_PER_TILE,
): void {
  const tiled = worldTiledMaterial(targetMaterial);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.material !== targetMaterial) return;
    const geo = child.geometry;
    if (!_processed.has(geo)) {
      tileGeometryWorld(geo, unitsPerTile, child.scale);
      _processed.add(geo);
    }
    child.material = tiled;
  });
}
