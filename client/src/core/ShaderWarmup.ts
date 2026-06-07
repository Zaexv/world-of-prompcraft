import * as THREE from 'three';
import { meshTypes, buildMesh, meshCategory } from '../meshes/core/MeshRegistry';
import { buildNPCMesh } from '../entities/npc/NPCMeshFactory';
import type { Rng } from '../systems/worldbuilder/RngTypes';

/** Deterministic throwaway RNG for procedural meshes that require ctx.rng. */
function makeWarmupRng(): Rng {
  let s = 123456789;
  const next = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return {
    next,
    nextInt: (n: number) => Math.floor(next() * n),
    nextRange: (lo: number, hi: number) => lo + next() * (hi - lo),
    chance: (p: number) => next() < p,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
  };
}

/**
 * Pre-compile every shader program at boot, behind the loading screen.
 *
 * `renderer.compile(scene, camera)` only warms the materials of objects already
 * in the scene at spawn. Monster / prop / building / vegetation types that first
 * appear in far biomes compile their shader programs synchronously on first
 * render — measured at ~38 ms each, i.e. a 600 ms stall when a chunk introduces
 * 16 new types at once. This builds one instance of every REGISTERED mesh type
 * (NPC types through the flat-shaded NPC pipeline, so the matching program
 * variant is produced), parks them far below the world, compiles, then removes
 * them — paying that cost once at load instead of as in-game spikes.
 *
 * Geometries/materials are intentionally NOT disposed: registered mesh instances
 * may share geometry/material references across builds, so disposing here would
 * corrupt later real spawns. The wrapper Object3Ds are dropped (GC'd); the leaked
 * GPU buffers are a handful of tiny offscreen meshes — negligible.
 */
export function warmUpShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): void {
  // Compile against the REAL scene, not an isolated one: a program's cache key
  // includes the scene's light count, fog and environment. An empty scene
  // compiles the 0-light / no-fog / no-env variant — which never renders — so the
  // real (3 lights + fog + env) variant would still compile on first frame. The
  // temp meshes are added below, compiled, then removed before any frame renders.
  // NOTE: scene.environment is still null here (SceneManager sets it via a 1s
  // setTimeout), so the envMap variant is NOT warmed and will recompile once when
  // the PMREM map lands. Make PMREM synchronous in SceneManager to close that gap.
  const hidden = new THREE.Vector3(0, 0, 0);
  const rng = makeWarmupRng();
  const temp: THREE.Object3D[] = [];

  for (const type of meshTypes()) {
    try {
      let obj: THREE.Object3D | undefined;
      if (meshCategory(type) === 'npc') {
        // Route through the NPC pipeline so flatShading/clone variants compile.
        obj = buildNPCMesh({ meshType: type, seed: 1 }, hidden, `__warmup_${type}`).object3D;
      } else {
        obj = buildMesh(type, { position: hidden, scale: 1, rng });
      }
      if (!obj) continue;
      obj.position.copy(hidden);
      obj.visible = true;
      obj.traverse((child) => {
        child.frustumCulled = false;
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(obj);
      temp.push(obj);
    } catch {
      // A type that can't build from a generic context simply isn't pre-warmed —
      // it will compile on first real use (same as before). Never fail boot.
    }
  }

  // Also compile dynamic materials (sprites/particles/basic) that aren't registered meshes.
  // Use a 1x1 DataTexture so it has valid image data for the GPU.
  const dummyMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummyMap.anisotropy = 8;
  dummyMap.needsUpdate = true; // DataTexture ctor doesn't flag for upload
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dummyMap, color: 0xffffff, transparent: true }));
  sprite.position.copy(hidden);
  sprite.frustumCulled = false;
  scene.add(sprite);
  temp.push(sprite);

  const points = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0]), 3)),
    new THREE.PointsMaterial({ map: dummyMap, size: 1, transparent: true, depthWrite: false })
  );
  points.position.copy(hidden);
  points.frustumCulled = false;
  scene.add(points);
  temp.push(points);

  // MeshBasicMaterial variants (Outlines, Sky, UI)
  const basicVariants = [
    { side: THREE.FrontSide, fog: true,  map: null },
    { side: THREE.BackSide,  fog: true,  map: null },
    { side: THREE.DoubleSide,fog: true,  map: null },
    { side: THREE.FrontSide, fog: false, map: null },
    { side: THREE.BackSide,  fog: false, map: null },
    { side: THREE.FrontSide, fog: true,  map: dummyMap },
  ];

  for (const v of basicVariants) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: v.side, fog: v.fog, map: v.map })
    );
    m.position.copy(hidden);
    m.frustumCulled = false;
    scene.add(m);
    temp.push(m);
  }

  // PBR variants (Standard/Physical)
  // We need to catch: flatShading on/off, fog on/off, clearcoat (for El Tito lenses)
  // We use dummyMap for all texture slots so we don't trigger "no image data" 
  // errors while real assets are still loading asynchronously.
  const pbrVariants = [
    { physical: false, flat: true,  fog: true,  clearcoat: 0, trans: false },
    { physical: false, flat: false, fog: true,  clearcoat: 0, trans: false },
    { physical: true,  flat: true,  fog: true,  clearcoat: 1, trans: false },
    { physical: false, flat: true,  fog: false, clearcoat: 0, trans: false },
    // With maps to catch anisotropy/normalMap variants used by buildings/terrain
    { physical: false, flat: true,  fog: true,  clearcoat: 0, trans: false, maps: true },
    { physical: true,  flat: true,  fog: true,  clearcoat: 1, trans: false, maps: true },
    { physical: true,  flat: true,  fog: true,  clearcoat: 1, trans: true },
  ];

  for (const v of pbrVariants) {
    const params: THREE.MeshStandardMaterialParameters = {
      color: 0xffffff, flatShading: v.flat, fog: v.fog,
      transparent: v.trans,
      map: v.maps ? dummyMap : null,
      normalMap: v.maps ? dummyMap : null,
      roughnessMap: v.maps ? dummyMap : null,
    };
    
    const mat = v.physical
      ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: v.clearcoat })
      : new THREE.MeshStandardMaterial(params);
    
    const m = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    m.position.copy(hidden);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    temp.push(m);
  }

  // Compile main materials
  renderer.compile(scene, camera);

  // Clean up references
  for (const obj of temp) scene.remove(obj);
}
