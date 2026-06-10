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
/** Resolve on the next animation frame so the DOM (loading bar) can repaint
 *  between warmup batches — the work is on the main thread, so without yielding
 *  the bar would freeze at 0% until everything finished. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** True when a texture's image is decoded and ready to upload to the GPU. */
function textureHasImageData(tex: THREE.Texture): boolean {
  const img = tex.image as
    | { data?: ArrayLike<number>; width?: number; height?: number; complete?: boolean }
    | undefined;
  if (!img) return false;
  if (img.data) return img.data.length > 0; // DataTexture
  if (img.complete === true) return true; // HTMLImageElement, fully loaded
  return typeof img.width === 'number' && img.width > 0; // ImageBitmap / canvas
}

/** A reusable 1×1 white image to stand in for textures still loading at warmup. */
let warmupPlaceholderImage: HTMLCanvasElement | null = null;
function getPlaceholderImage(): HTMLCanvasElement {
  if (!warmupPlaceholderImage) {
    warmupPlaceholderImage = document.createElement('canvas');
    warmupPlaceholderImage.width = 1;
    warmupPlaceholderImage.height = 1;
    const ctx = warmupPlaceholderImage.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1, 1);
    }
  }
  return warmupPlaceholderImage;
}

/** Give every texture bound to the warmup meshes a valid image before the render.
 *  Real meshes built above bind Poly Haven maps that are STILL loading async at
 *  warmup time; rendering them makes three try to upload a texture with no image
 *  → "Texture marked for update but no image data found." Setting `needsUpdate =
 *  false` does NOT help (three's setter ignores `false`), so instead we drop in a
 *  1×1 placeholder so the upload succeeds silently. The asset loader overwrites
 *  `image` and re-flags `needsUpdate` on its onLoad, so the real texture still
 *  uploads at runtime. Shader programs are unaffected — the cache key depends on
 *  which map SLOTS are bound, not on the pixels. */
function fillUnloadedTextures(roots: THREE.Object3D[]): void {
  for (const root of roots) {
    root.traverse((child) => {
      const material = (child as THREE.Mesh).material;
      if (!material) return;
      const mats = Array.isArray(material) ? material : [material];
      for (const mat of mats) {
        for (const value of Object.values(mat as unknown as Record<string, unknown>)) {
          if (value instanceof THREE.Texture && !textureHasImageData(value)) {
            value.image = getPlaceholderImage();
            value.needsUpdate = true;
          }
        }
      }
    });
  }
}

export async function warmUpShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  onProgress?: (fraction: number) => void,
): Promise<void> {
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

  // Each closure adds some temp meshes to the scene; the runner below executes
  // them in small batches, compiling + yielding between batches so the loading
  // bar reports real progress instead of freezing on one synchronous block.
  const steps: Array<() => void> = [];

  for (const type of meshTypes()) {
    steps.push(() => {
      let obj: THREE.Object3D | undefined;
      if (meshCategory(type) === 'npc') {
        // Route through the NPC pipeline so flatShading/clone variants compile.
        obj = buildNPCMesh({ meshType: type, seed: 1 }, hidden, `__warmup_${type}`).object3D;
      } else {
        obj = buildMesh(type, { position: hidden, scale: 1, rng });
      }
      if (!obj) return;
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
    });
  }

  // A 1×1 DataTexture stands in for every bound slot so no "no image data" error
  // fires while the real assets are still loading asynchronously.
  const dummyMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummyMap.anisotropy = 8;
  dummyMap.needsUpdate = true; // DataTexture ctor doesn't flag for upload

  // Dynamic materials (sprites/particles) that aren't registered meshes.
  steps.push(() => {
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
  });

  // MeshBasicMaterial variants (Outlines, Sky, UI)
  steps.push(() => {
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
  });

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
    steps.push(() => {
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
    });
  }

  // Transparent + fog:false outliers (glass/lenses, sky-adjacent UI panels) that
  // don't share the opaque world program. Kept minimal — these are rare.
  steps.push(() => {
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
  });

  // ── Run the steps in small batches, compiling + yielding between each batch ──
  // so the loading bar reports real progress. A step that can't build (a mesh
  // type needing context we don't have) is skipped — it compiles on first real
  // use, same as before; warmup never fails boot. The two render passes after
  // the loop warm shadow-depth + the off-screen (no-tone-mapping) variants for
  // everything added above.
  const BATCH = 4;
  const totalUnits = steps.length + 1; // +1 → the final render pass below
  for (let i = 0; i < steps.length; i += BATCH) {
    const end = Math.min(i + BATCH, steps.length);
    for (let j = i; j < end; j++) {
      try {
        steps[j]!();
      } catch {
        // Unbuildable type/variant — skip; it compiles on first real use.
      }
    }
    renderer.compile(scene, camera);
    onProgress?.(end / totalUnits);
    await nextFrame();
  }

  // Final pass renders the temp meshes into an OFF-SCREEN target — NOT the screen.
  // Two reasons:
  //   1. It compiles the variants `compile()` does NOT: the shadow-DEPTH programs
  //      (only built during the shadow-map pass) plus the NO-tone-mapping variant.
  //      three.js folds tone mapping into a material's program ONLY when rendering
  //      to the screen; the game renders the world through an EffectComposer into a
  //      render target (tone mapping is a later fullscreen pass), so the world
  //      materials need exactly this no-tone-mapping variant — the one this warms.
  //   2. Rendering to the screen here would PAINT the pile of temp warmup meshes
  //      onto the visible canvas (a "all textures combined" flash) the moment the
  //      browser gets to repaint between batches. Off-screen never touches it.
  // The shadow pass still runs (shadowMap.needsUpdate) and writes to the shadow map
  // regardless of the final target, so shadow-depth programs compile here too.
  //
  // Stand a 1×1 placeholder in for any texture still loading, so the render below
  // doesn't warn "Texture marked for update but no image data found" (see helper).
  fillUnloadedTextures(temp);

  const rt = new THREE.WebGLRenderTarget(4, 4);
  renderer.setRenderTarget(rt);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  rt.dispose();

  // Remove the temp meshes synchronously, with NO yield after the render above, so
  // the browser never paints a frame that still contains them.
  for (const obj of temp) scene.remove(obj);
  onProgress?.(1);
}
