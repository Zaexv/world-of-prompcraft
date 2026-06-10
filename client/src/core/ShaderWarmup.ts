import * as THREE from 'three';
import { meshTypes, buildMesh, meshCategory, isInstanceable } from '../meshes/core/MeshRegistry';
import { buildNPCMesh } from '../entities/npc/NPCMeshFactory';
import { buildInstancedBatch } from '../systems/worldbuilder/instanceBatch';
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

      // Instanceable types (trees, …) render in-game as InstancedMesh, whose
      // shader has the USE_INSTANCING define — a DIFFERENT program from the
      // plain mesh built above. Warm it too, or the first instanced batch (a
      // forest / Fort Malaka) compiles it mid-move. One instance is enough; the
      // program key doesn't depend on instance count.
      if (isInstanceable(type)) {
        const batch = buildInstancedBatch(type, [{ pos: hidden.clone(), scale: 1, rotationY: 0 }], rng);
        if (batch) {
          for (const o of batch.objects) {
            o.frustumCulled = false;
            scene.add(o);
            temp.push(o);
          }
          // colliders are invisible — no program to warm; drop them.
        }
      }
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

  // PBR variants (Standard/Physical).
  //
  // The program cache key splits on the material's *map-slot signature* (which
  // texture slots are bound → which UV channels + which lighting defines the
  // shader needs). PBRMaps.applyXPBR produces exactly five distinct combos; an
  // earlier version of this list only warmed "all three maps" and "no maps",
  // so the nor+rough / nor-only / map+nor combos compiled on first render —
  // a synchronous spike each time an NPC (skin/leather/cloth) or building
  // (wood/malaka/canopy) first entered view. Warming every combo here closes
  // that gap. We use dummyMap for each bound slot so no "no image data" error
  // fires while the real assets are still loading asynchronously.
  //
  //   map  nor  rough   produced by
  //    ·    ✓    ✓      terrain, leather, silk/velvet/wool
  //    ·    ✓    ·      skin
  //    ✓    ✓    ·      wood, canopy, malaka stucco/roof/stone/wood
  //    ✓    ✓    ✓      stone, bark
  //    ·    ·    ·      gold/metal
  const mapCombos: { map: boolean; nor: boolean; rough: boolean }[] = [
    { map: false, nor: true,  rough: true  },
    { map: false, nor: true,  rough: false },
    { map: true,  nor: true,  rough: false },
    { map: true,  nor: true,  rough: true  },
    { map: false, nor: false, rough: false },
  ];

  // flatShading splits the program (NPC meshes are flat-shaded, world geometry
  // is smooth); physical adds the clearcoat path (El Tito lenses, water);
  // vertexColors (USE_COLOR) is its own define — terrain and several procedural
  // meshes use it. `side` splits the program too (DOUBLE_SIDED / FLIP_SIDED):
  // palm fronds, cloth, foliage, glass are double-sided and compiled unwarmed at
  // the coast. fog + scene.environment (envMap) are on for all world content.
  // Cross-product bounded (5 × 2 × 2 × 2 × 2 = 80).
  for (const physical of [false, true]) {
    for (const flat of [true, false]) {
      for (const vertexColors of [false, true]) {
        for (const side of [THREE.FrontSide, THREE.DoubleSide]) {
          for (const combo of mapCombos) {
            const params: THREE.MeshStandardMaterialParameters = {
              color: 0xffffff, flatShading: flat, fog: true, vertexColors, side,
              map: combo.map ? dummyMap : null,
              normalMap: combo.nor ? dummyMap : null,
              roughnessMap: combo.rough ? dummyMap : null,
            };
            const mat = physical
              ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 1 })
              : new THREE.MeshStandardMaterial(params);

            const m = new THREE.Mesh(new THREE.BoxGeometry(), mat);
            m.position.copy(hidden);
            m.frustumCulled = false;
            m.castShadow = true;
            m.receiveShadow = true;
            scene.add(m);
            temp.push(m);
          }
        }
      }
    }
  }

  // Transparent + fog:false outliers (glass/lenses, sky-adjacent UI panels) that
  // don't share the opaque world program. Kept minimal — these are rare.
  for (const v of [
    { physical: true,  flat: true,  fog: true,  trans: true  },
    { physical: false, flat: true,  fog: false, trans: false },
  ]) {
    const params: THREE.MeshStandardMaterialParameters = {
      color: 0xffffff, flatShading: v.flat, fog: v.fog, transparent: v.trans,
    };
    const mat = v.physical
      ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 1 })
      : new THREE.MeshStandardMaterial(params);
    const m = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    m.position.copy(hidden);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    temp.push(m);
  }

  // Compile main materials.
  renderer.compile(scene, camera);

  // A real render pass compiles the variants `compile()` does NOT: the
  // shadow-DEPTH programs (only built during the shadow-map pass) and any
  // draw-state-specific variant. The temp meshes sit at the origin in front of
  // the camera and the sun's shadow frustum, so one render warms their cast +
  // receive shadow programs.
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);

  // Render once more into an OFF-SCREEN target. three.js folds tone mapping into
  // the material program ONLY when rendering to the screen — so a screen render
  // produces the `TONE_MAPPING` variant, but the game renders the scene through
  // EffectComposer into a render target (and the water reflection cube is another
  // off-screen pass), which needs the NO-tone-mapping variant. Without this they
  // compiled on first sight (the persistent coast/Fort-Malaka stutter). Same
  // meshes, different output → the complementary programs compile here.
  const rt = new THREE.WebGLRenderTarget(4, 4);
  renderer.setRenderTarget(rt);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  rt.dispose();

  // Clean up references
  for (const obj of temp) scene.remove(obj);
}
