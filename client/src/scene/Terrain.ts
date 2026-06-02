import * as THREE from 'three';
import { applyTerrainPBR } from '../utils/PBRMaps';
import {
  BiomeType,
  type BiomeWeights,
  getBiomeWeights,
  biomeHeightModifier,
  getBiomeColor,
  getBiomeEmissive,
  getBiomeSurfaceNoise,
} from './Biomes';
import { getVerticalLiftAt, hasLiftInBounds } from './VerticalTerrain';

// ── Flat building pads ───────────────────────────────────────────────────────
// A building placed at a single `getHeightAt(center)` floats/tilts when the
// authored hills/mountain slope the ground across its footprint. Rather than
// remove those features (they're deliberate terrain), each affected building
// gets a local pad: its footprint is levelled to the natural ground height at
// its own centre, then smoothly blended back out — so the building sits flush
// while the surrounding mountain/hill is preserved beyond the blend ring.
//
// `target` is computed lazily as the *natural* (pre-pad) height at the centre,
// so the building stays exactly where it's placed and only the ground moves.
interface BuildingPad {
  x: number;
  z: number;
  inner: number;        // radius levelled flat (for circle)
  outer: number;        // radius where pad blends back (for circle) or AABB radius (for rect)
  target?: number;      // lazily-filled natural ground height at (x, z)
  manifestHeight?: number; // optional fixed height from manifest
  
  // Shape support
  shape: 'circle' | 'rect';
  width?: number;       // full width (X)
  depth?: number;       // full depth (Z)
  rotation?: number;    // rotation in radians
  blendWidth?: number;  // explicit blend width for rects
}

const PAD_BLEND = 14;   // width of the flat→natural blend ring

interface FootprintSpec {
  shape: 'circle' | 'rect';
  radius?: number;
  width?: number;
  depth?: number;
}

/** Base footprints for mesh types (at scale 1.0) used for auto-padding. */
export const FOOTPRINT_SPECS: Record<string, FootprintSpec> = {
  'malaka_broken_church': { shape: 'rect', width: 16, depth: 24 },
  'malaka_ermita': { shape: 'rect', width: 10, depth: 13 },
  'malaka_bodega': { shape: 'rect', width: 8, depth: 15 },
  'roman_amphitheatre': { shape: 'circle', radius: 4 },
  'malaka_patio_house': { shape: 'rect', width: 10, depth: 10 },
  'malaka_cortijo': { shape: 'rect', width: 12, depth: 10 },
  'malaka_house': { shape: 'rect', width: 4, depth: 4 },
  'malaka_house_reconstructed': { shape: 'rect', width: 5, depth: 5 },
  'malaka_house_n3': { shape: 'rect', width: 5.5, depth: 5.5 },
  'malaka_castle': { shape: 'rect', width: 16, depth: 16 },
  'malaka_farm': { shape: 'rect', width: 46, depth: 40 },
  'tower': { shape: 'circle', radius: 6 },
  'ruins': { shape: 'circle', radius: 8 },
  'altar': { shape: 'circle', radius: 4 },
  'moonwell': { shape: 'circle', radius: 4 },
  'pavilion': { shape: 'circle', radius: 5 },
  'portal_arch': { shape: 'rect', width: 8, depth: 4 },
  'wooden_fence': { shape: 'rect', width: 6, depth: 1 },
};

// Hardcoded legacy pads (to be gradually moved to manifest)
const LEGACY_BUILDING_PADS: BuildingPad[] = [
  // These are now handled automatically by setManifest for most buildings.
];

let _manifestPads: BuildingPad[] = [];

function getBuildingPads(): BuildingPad[] {
  return [...LEGACY_BUILDING_PADS, ..._manifestPads];
}

// ── Ground paint layer ────────────────────────────────────────────────────────
// Lets the editor override the biome-driven ground colour with a chosen surface
// type (grass/sand/mud/…) inside radial brush strokes. Pure colour tint — does
// NOT change height/normals — applied in the chunk vertex-colour pass and
// persisted in the manifest under `world.topology.paint`.
export const GROUND_TYPES: Record<string, [number, number, number]> = {
  grass: [0.29, 0.42, 0.18],
  mud:   [0.25, 0.19, 0.13],
  dirt:  [0.40, 0.30, 0.20],
  sand:  [0.76, 0.66, 0.42],
  rock:  [0.42, 0.40, 0.37],
  gravel:[0.52, 0.50, 0.47],
  ash:   [0.20, 0.18, 0.18],
  snow:  [0.90, 0.93, 0.97],
};

interface PaintStroke {
  x: number;
  z: number;
  radius: number;
  color: [number, number, number];
}

let _paintStrokes: PaintStroke[] = [];

/** Cheap AABB pre-check: does any paint stroke overlap this region? */
function paintInBounds(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  for (const s of _paintStrokes) {
    const dx = Math.max(0, Math.max(minX - s.x, s.x - maxX));
    const dz = Math.max(0, Math.max(minZ - s.z, s.z - maxZ));
    if (dx * dx + dz * dz < s.radius * s.radius) return true;
  }
  return false;
}

/** Strongest overlapping paint stroke at (x,z): its colour + blend weight, or null. */
function sampleGroundPaint(x: number, z: number): { r: number; g: number; b: number; w: number } | null {
  if (_paintStrokes.length === 0) return null;
  let bestW = 0;
  let col: [number, number, number] | null = null;
  for (const s of _paintStrokes) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d >= s.radius) continue;
    const t = d / s.radius;
    const w = 1 - t * t * (3 - 2 * t); // smoothstep: 1 at centre → 0 at radius
    if (w > bestW) { bestW = w; col = s.color; }
  }
  if (bestW <= 0 || !col) return null;
  return { r: col[0], g: col[1], b: col[2], w: bestW };
}

// ── Additive sculpt layer ─────────────────────────────────────────────────────
// True terrain sculpting: each RAISE/LOWER brush deposit adds a smooth, radial
// height delta on TOP of the noise + building pads. Persisted in the manifest
// under `world.topology.sculpt` so the editor mesh, the in-game mesh, collision,
// and player physics all read the identical deformed surface.
interface SculptStroke {
  x: number;
  z: number;
  radius: number;
  delta: number;
  flatten?: boolean;
}

let _sculptStrokes: SculptStroke[] = [];

/** Cheap AABB pre-check: does any sculpt stroke overlap this region? */
function sculptInBounds(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  for (const s of _sculptStrokes) {
    const dx = Math.max(0, Math.max(minX - s.x, s.x - maxX));
    const dz = Math.max(0, Math.max(minZ - s.z, s.z - maxZ));
    if (dx * dx + dz * dz < s.radius * s.radius) return true;
  }
  return false;
}

/** Sum smooth radial height deltas from all overlapping sculpt strokes. */
function applySculpt(x: number, z: number, h: number): number {
  if (_sculptStrokes.length === 0) return h;
  let finalH = h;
  for (const s of _sculptStrokes) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d >= s.radius) continue;
    const t = d / s.radius;
    const w = (1 - t * t * (3 - 2 * t)); // smoothstep falloff: 1 at centre → 0 at radius
    if (s.flatten) {
      finalH += (s.delta - finalH) * w;
    } else {
      finalH += s.delta * w;
    }
  }
  return finalH;
}

/** Cheap AABB pre-check: does any pad overlap this region? */
function padsInBounds(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  for (const p of getBuildingPads()) {
    // For OBBs, we use the conservative outer radius for the AABB pre-check
    const dx = Math.max(0, Math.max(minX - p.x, p.x - maxX));
    const dz = Math.max(0, Math.max(minZ - p.z, p.z - maxZ));
    if (dx * dx + dz * dz < p.outer * p.outer) return true;
  }
  return false;
}

function padTarget(p: BuildingPad): number {
  if (p.manifestHeight !== undefined) return p.manifestHeight;
  if (p.target === undefined) {
    p.target = Terrain.computeHeight(p.x, p.z) + getVerticalLiftAt(p.x, p.z);
  }
  return p.target;
}

/**
 * Level a sample toward the strongest overlapping building pad. 
 * Supports both circular and oriented rectangular (OBB) footprints.
 */
function applyBuildingPads(x: number, z: number, h: number): number {
  let bestFlat = 0;
  let bestTarget = 0;
  
  for (const p of getBuildingPads()) {
    let flat = 0;
    
    if (p.shape === 'circle') {
      const dist = Math.hypot(x - p.x, z - p.z);
      if (dist >= p.outer) continue;
      if (dist <= p.inner) {
        flat = 1;
      } else {
        const t = (dist - p.inner) / (p.outer - p.inner);
        flat = 1 - t * t * (3 - 2 * t);
      }
    } else {
      // Rectangular OBB logic
      const dx = x - p.x;
      const dz = z - p.z;
      const rot = p.rotation ?? 0;
      
      const localX = Math.abs(dx * Math.cos(-rot) - dz * Math.sin(-rot));
      const localZ = Math.abs(dx * Math.sin(-rot) + dz * Math.cos(-rot));
      
      const halfW = (p.width ?? 0) / 2;
      const halfD = (p.depth ?? 0) / 2;
      
      const distX = Math.max(0, localX - halfW);
      const distZ = Math.max(0, localZ - halfD);
      const dist = Math.sqrt(distX * distX + distZ * distZ);
      
      const blendWidth = p.blendWidth ?? PAD_BLEND;
      if (dist >= blendWidth) continue;
      
      if (dist <= 0) {
        flat = 1;
      } else {
        const t = dist / blendWidth;
        flat = 1 - t * t * (3 - 2 * t);
      }
    }
    
    if (flat > bestFlat) {
      bestFlat = flat;
      bestTarget = padTarget(p);
    }
  }
  
  if (bestFlat <= 0) return h;
  return h * (1 - bestFlat) + bestTarget * bestFlat;
}

/**
 * Infinite procedural terrain with chunk-based loading and biome blending.
 *
 * Only chunks within a configurable radius around the player are loaded.
 * Chunks beyond that radius (plus a buffer) are disposed.
 *
 * The same deterministic noise function powers both chunk mesh generation
 * and the public `getHeightAt(x, z)` API, so height queries are always
 * consistent regardless of which chunks are currently loaded.
 */

// ── Chunk constants ──────────────────────────────────────────────────────────
const CHUNK_SIZE = 64;          // world-units per chunk side
const CHUNK_SEGMENTS = 16;      // vertex subdivisions per chunk side (289 vs 1089 vertices — 4× less work)
const VIEW_RADIUS = 5;          // chunks visible in each direction (11x11 = 121 chunks)
const UNLOAD_RADIUS = VIEW_RADIUS + 2; // buffer before disposal
// Preload the full view radius synchronously during bootstrap (loading screen is
// still visible, so the ~240ms cost is invisible to the player).  This ensures
// the first player movement never has to stream chunks and eliminates the
// deterministic half-second stutter on first walk.
const INITIAL_PRELOAD_RADIUS = VIEW_RADIUS;
// Time-budget approach: stop loading once the frame has spent this many ms on
// chunk generation, regardless of how many chunks were processed.  A single
// expensive chunk won't exceed the budget; cheap frames can load more.
const CHUNK_BUDGET_MS = 5;
// Spread geometry disposal to avoid GPU-pipeline stalls from bulk dispose() calls.
const MAX_UNLOADS_PER_FRAME = 3;

// ── Shared material (created once, reused for every chunk) ───────────────────
let sharedMaterial: THREE.MeshStandardMaterial | null = null;

function getSharedMaterial(): THREE.MeshStandardMaterial {
  if (sharedMaterial) return sharedMaterial;

  sharedMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.0,
    flatShading: false,
    emissive: new THREE.Color(0x000000),
    // The scene.environment PMREM map is captured from the blue sky/background.
    // On shadowed, desaturated (rocky) ground this blue reflection dominates the
    // warm direct lights and makes the floor read cold blue-grey. Disable env
    // reflection on the terrain entirely — the ground is lit purely by the warm
    // sun + hemisphere + ambient, never by the blue sky.
    envMapIntensity: 0.0,
  });

  applyTerrainPBR(sharedMaterial);

  // Patch the standard material shader to add per-vertex emissive contribution
  sharedMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      /* glsl */ `
        #include <common>
        attribute vec3 aEmissive;
        varying vec3 vEmissiveGlow;
      `,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
        #include <begin_vertex>
        vEmissiveGlow = aEmissive;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      /* glsl */ `
        #include <common>
        varying vec3 vEmissiveGlow;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += vEmissiveGlow;
      `,
    );
  };

  return sharedMaterial;
}

// ── Chunk data ───────────────────────────────────────────────────────────────
interface ChunkData {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
}

// ── Worker manifest serialisation ────────────────────────────────────────────

export interface TerrainManifestData {
  biomeStart: number;
  transitionWidth: number;
  biomeAmplitudes: Record<string, number>;
  biomeColors: Record<string, {
    low:  [number, number, number];
    mid:  [number, number, number];
    high: [number, number, number];
    peak: [number, number, number];
  }>;
  features: Array<{ x: number; z: number; innerRadius: number; outerRadius: number; height: number }>;
  paths: Array<{ sx: number; sz: number; ex: number; ez: number; width: number }>;
}

// ── Terrain class ────────────────────────────────────────────────────────────
export class Terrain {
  private scene: THREE.Scene;
  private chunks: Map<string, ChunkData> = new Map();
  private chunkLoadQueue: Array<{ cx: number; cz: number; key: string }> = [];
  private queuedChunkKeys: Set<string> = new Set();
  private chunkUnloadQueue: string[] = [];

  /** Called whenever a new chunk is created. Args: (chunkX, chunkZ, worldX, worldZ). */
  public onChunkLoaded: ((chunkX: number, chunkZ: number, worldX: number, worldZ: number) => void) | null = null;

  /** Called whenever a chunk is unloaded. Args: (chunkX, chunkZ). */
  public onChunkUnloaded: ((chunkX: number, chunkZ: number) => void) | null = null;

  private lastPlayerCX = Number.MAX_SAFE_INTEGER;
  private lastPlayerCZ = Number.MAX_SAFE_INTEGER;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Performs the initial chunk loading. 
   * Call this AFTER wiring onChunkLoaded/onChunkUnloaded callbacks.
   */
  public init(): void {
    // Load the full view radius synchronously so the first player movement
    // never triggers chunk streaming and the associated stutter.
    this.queueChunksAround(0, 0, INITIAL_PRELOAD_RADIUS);
    this.processChunkQueue((2 * INITIAL_PRELOAD_RADIUS + 1) ** 2);
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the full world height at any (x, z): terrain noise + vertical lift.
   * Does NOT depend on loaded chunks — pure math.
   * This is the authoritative height used by PlayerController and all placement code.
   */
  getHeightAt(x: number, z: number): number {
    const h = Terrain.computeHeight(x, z) + getVerticalLiftAt(x, z);
    return applySculpt(x, z, applyBuildingPads(x, z, h));
  }

  /**
   * Refreshes all chunks within a radius of the given world position.
   * Useful when terrain features or pads are updated.
   */
  public refreshAt(x: number, z: number, radius: number): void {
    const minCX = Math.floor((x - radius) / CHUNK_SIZE);
    const maxCX = Math.floor((x + radius) / CHUNK_SIZE);
    const minCZ = Math.floor((z - radius) / CHUNK_SIZE);
    const maxCZ = Math.floor((z + radius) / CHUNK_SIZE);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        if (chunk) {
          // Dispose and reload
          this.unloadChunk(key, chunk);
          this.loadChunk(cx, cz);
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setManifest(data: any): void {
    _manifestPads = [];
    _sculptStrokes = [];
    _paintStrokes = [];

    // 0b. Ground paint strokes (surface-type colour tint)
    if (data?.world?.topology?.paint) {
      for (const s of data.world.topology.paint) {
        if (typeof s?.x === 'number' && typeof s?.z === 'number' && s.radius > 0) {
          _paintStrokes.push({
            x: s.x,
            z: s.z,
            radius: s.radius,
            color: GROUND_TYPES[s.type] ?? GROUND_TYPES.grass,
          });
        }
      }
    }

    // 0. Additive sculpt strokes (true raise/lower terrain deformation)
    if (data?.world?.topology?.sculpt) {
      for (const s of data.world.topology.sculpt) {
        if (typeof s?.x === 'number' && typeof s?.z === 'number' && s.radius > 0) {
          _sculptStrokes.push({ 
            x: s.x, 
            z: s.z, 
            radius: s.radius, 
            delta: s.delta ?? 0,
            flatten: !!s.flatten
          });
        }
      }
    }

    // 1. Process explicit topology features (e.g., flat_patch)
    if (data?.world?.topology?.features) {
      for (const f of data.world.topology.features) {
        if (f.type === 'flat_patch') {
          const shape = f.shape ?? 'circle';
          if (shape === 'circle') {
            _manifestPads.push({
              x: f.transform.x,
              z: f.transform.z,
              inner: f.radii.inner,
              outer: f.radii.outer,
              manifestHeight: f.height,
              shape: 'circle',
            });
          } else {
            const width = f.width ?? (f.radii.inner * 2);
            const depth = f.depth ?? (f.radii.inner * 2);
            const rotation = f.transform?.rotation ?? f.rotation ?? 0;
            const blendWidth = f.blendWidth ?? PAD_BLEND;
            const innerRadius = Math.sqrt(width * width + depth * depth) / 2;
            _manifestPads.push({
              x: f.transform.x,
              z: f.transform.z,
              shape: 'rect',
              width,
              depth,
              rotation,
              inner: 0,
              blendWidth,
              outer: innerRadius + blendWidth,
              manifestHeight: f.height,
            });
          }
        }
      }
    }

    // 2. Automatically create pads for all landmarks in the manifest
    if (data?.zones) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const zone of Object.values(data.zones) as any[]) {
        if (zone.architecture?.landmarks) {
          for (const l of zone.architecture.landmarks) {
            const spec = l.visual?.metadata?.footprint ?? FOOTPRINT_SPECS[l.type];
            if (spec) {
              const scale = l.transform.scale ?? 1.0;
              const rotation = l.transform.rotation ? l.transform.rotation[1] : 0;
              
              // Optional metadata height override
              const manifestHeight = l.visual?.metadata?.terrain_height as number | undefined;

              if (spec.shape === 'circle') {
                const inner = (spec.radius ?? 1) * scale;
                _manifestPads.push({
                  x: l.transform.position[0],
                  z: l.transform.position[2],
                  shape: 'circle',
                  inner,
                  outer: inner + PAD_BLEND,
                  manifestHeight,
                });
              } else {
                const width = (spec.width ?? 1) * scale;
                const depth = (spec.depth ?? 1) * scale;
                const blendWidth = PAD_BLEND;
                const innerRadius = Math.sqrt(width * width + depth * depth) / 2;
                
                _manifestPads.push({
                  x: l.transform.position[0],
                  z: l.transform.position[2],
                  shape: 'rect',
                  width,
                  depth,
                  rotation,
                  inner: 0,
                  blendWidth,
                  outer: innerRadius + blendWidth,
                  manifestHeight,
                });
              }
            }
          }
        }
      }
    }
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  /**
   * Call each frame with the player's world position.
   * Loads missing chunks within view radius, unloads distant ones.
   */
  update(playerX: number, playerZ: number): void {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);
    const chunkChanged = cx !== this.lastPlayerCX || cz !== this.lastPlayerCZ;

    if (chunkChanged) {
      this.lastPlayerCX = cx;
      this.lastPlayerCZ = cz;

      // Rebuild load queue sorted by proximity so the nearest tiles appear first.
      this.chunkLoadQueue = [];
      this.queuedChunkKeys.clear();
      this.queueChunksAround(cx, cz, VIEW_RADIUS);

      // Queue distant chunks for deferred disposal instead of disposing all at once.
      for (const [key, chunk] of this.chunks) {
        const dx = chunk.cx - cx;
        const dz = chunk.cz - cz;
        if (Math.abs(dx) > UNLOAD_RADIUS || Math.abs(dz) > UNLOAD_RADIUS) {
          if (!this.chunkUnloadQueue.includes(key)) {
            this.chunkUnloadQueue.push(key);
          }
        }
      }
    }

    // ── Time-budgeted chunk loading ────────────────────────────────────────
    // Load at most CHUNK_BUDGET_MS of chunks per frame so a single expensive
    // chunk cannot blow the full frame budget.  The nearest chunks (sorted by
    // queueChunksAround) always appear first.
    if (this.chunkLoadQueue.length > 0) {
      const loadStart = performance.now();
      while (this.chunkLoadQueue.length > 0 && (performance.now() - loadStart) < CHUNK_BUDGET_MS) {
        const next = this.chunkLoadQueue.shift();
        if (!next) break;
        this.queuedChunkKeys.delete(next.key);
        if (!this.chunks.has(next.key)) this.loadChunk(next.cx, next.cz);
      }
    }

    // ── Deferred unloading ─────────────────────────────────────────────────
    for (let i = 0; i < MAX_UNLOADS_PER_FRAME && this.chunkUnloadQueue.length > 0; i++) {
      const key = this.chunkUnloadQueue.shift()!;
      const chunk = this.chunks.get(key);
      if (chunk) this.unloadChunk(key, chunk);
    }
  }

  private enqueueChunkLoad(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key) || this.queuedChunkKeys.has(key)) return;
    this.queuedChunkKeys.add(key);
    this.chunkLoadQueue.push({ cx, cz, key });
  }

  private queueChunksAround(centerCX: number, centerCZ: number, radius: number): void {
    const candidates: Array<{ cx: number; cz: number; distSq: number }> = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = centerCX + dx;
        const cz = centerCZ + dz;
        candidates.push({ cx, cz, distSq: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.distSq - b.distSq);
    for (const candidate of candidates) {
      this.enqueueChunkLoad(candidate.cx, candidate.cz);
    }
  }

  private processChunkQueue(maxLoads: number): void {
    for (let i = 0; i < maxLoads && this.chunkLoadQueue.length > 0; i++) {
      const next = this.chunkLoadQueue.shift();
      if (!next) break;
      this.queuedChunkKeys.delete(next.key);
      if (!this.chunks.has(next.key)) {
        this.loadChunk(next.cx, next.cz);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Noise function (static so it can be used without an instance)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Multi-octave sin/cos noise — deterministic for any (x, z).
   * This is the single source of truth for terrain height everywhere.
   * Now includes biome-blended height modifications.
   */
  static computeHeight(x: number, z: number, precomputedWeights?: BiomeWeights): number {
    let h = 0;

    // Large rolling hills (base terrain)
    h += Math.sin(x * 0.01 + 0.3) * Math.cos(z * 0.012 + 1.7) * 8;
    h += Math.sin(x * 0.007 - 1.2) * Math.sin(z * 0.009 + 0.8) * 6;

    // Broad undulation
    h += Math.cos(x * 0.005 + 2.5) * Math.sin(z * 0.006 - 0.4) * 4;

    // Medium detail
    h += Math.sin(x * 0.03 + 2.1) * Math.cos(z * 0.028 - 0.5) * 2.5;
    h += Math.cos(x * 0.025 + 0.7) * Math.sin(z * 0.035 + 1.3) * 2.0;

    // Medium-fine detail
    h += Math.sin(x * 0.05 - 0.9) * Math.cos(z * 0.055 + 2.3) * 1.2;

    // Fine detail
    h += Math.sin(x * 0.08 + 4.0) * Math.cos(z * 0.07 - 2.0) * 0.3;
    h += Math.cos(x * 0.09 - 1.5) * Math.sin(z * 0.1 + 3.0) * 0.2;

    // Very fine detail (root-like bumps) - significantly reduced to avoid "teeth"
    h += Math.sin(x * 0.15 + 1.1) * Math.cos(z * 0.13 - 3.2) * 0.05;

    // Blend in biome-specific height modifications.
    // Accept pre-computed weights from the caller to avoid a redundant getBiomeWeights call.
    const weights = precomputedWeights ?? getBiomeWeights(x, z);
    for (const biome of [
      BiomeType.EmberWastes,
      BiomeType.CrystalTundra,
      BiomeType.TwilightMarsh,
      BiomeType.SunlitMeadows,
      BiomeType.Desert,
    ]) {
      const w = weights[biome];
      if (w > 0.001) {
        h += biomeHeightModifier(x, z, biome) * w;
      }
    }

    return h;
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Chunk lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  public loadChunk(cx: number, cz: number): void {
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;
    const segments = CHUNK_SEGMENTS;
    const COLS = segments + 1;               // 33 — vertices per row
    const STEP = CHUNK_SIZE / segments;      // 2 world units — vertex spacing

    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const vertexCount = positions.count;

    // Fast pre-check: if no terrain feature overlaps this chunk, getVerticalLiftAt
    // returns 0 for every vertex and we can skip calling it entirely.
    const chunkHasLift = hasLiftInBounds(worldX, worldX + CHUNK_SIZE, worldZ, worldZ + CHUNK_SIZE);
    const chunkHasPad = padsInBounds(worldX, worldX + CHUNK_SIZE, worldZ, worldZ + CHUNK_SIZE);
    const chunkHasSculpt = sculptInBounds(worldX, worldX + CHUNK_SIZE, worldZ, worldZ + CHUNK_SIZE);
    const chunkHasPaint = paintInBounds(worldX, worldX + CHUNK_SIZE, worldZ, worldZ + CHUNK_SIZE);

    // Full world height for a sample point, matching getHeightAt (noise + lift +
    // building-pad levelling + sculpt). Used for edge-neighbour normals below too.
    const sampleHeight = (sx: number, sz: number, weights?: BiomeWeights): number => {
      const h = Terrain.computeHeight(sx, sz, weights) + (chunkHasLift ? getVerticalLiftAt(sx, sz) : 0);
      const padded = chunkHasPad ? applyBuildingPads(sx, sz, h) : h;
      return chunkHasSculpt ? applySculpt(sx, sz, padded) : padded;
    };

    // ── Pass 1: world-space positions + biome weights + heights ───────────────
    // getBiomeWeights (sqrt + atan2 + 5 cos) is called ONCE per vertex here and
    // cached.  All later passes reuse the cache, eliminating the previous 8× redundancy.
    const biomeWeightsCache: BiomeWeights[] = new Array(vertexCount);
    const heightCache = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const lx = positions.getX(i) + worldX + CHUNK_SIZE * 0.5;
      const lz = positions.getZ(i) + worldZ + CHUNK_SIZE * 0.5;
      positions.setX(i, lx);
      positions.setZ(i, lz);

      const weights = getBiomeWeights(lx, lz);
      biomeWeightsCache[i] = weights;

      // Pass cached weights so computeHeight skips its own getBiomeWeights call.
      const h = sampleHeight(lx, lz, weights);
      heightCache[i] = h;
      positions.setY(i, h);
    }
    positions.needsUpdate = true;

    // ── Pass 2: normals via height cache ──────────────────────────────────────
    // Interior vertices (31×31 = 961 of 1089) use adjacent cached heights — zero
    // extra height queries.  Only the ~132 edge vertices that need an outside-chunk
    // neighbour call computeHeight (cheap: no separate biome weight lookup).
    const normalValues = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const ix = i % COLS;
      const iy = Math.floor(i / COLS);
      const vx = positions.getX(i);
      const vz = positions.getZ(i);

      const hL = ix > 0       ? heightCache[i - 1]!    : sampleHeight(vx - STEP, vz);
      const hR = ix < segments ? heightCache[i + 1]!    : sampleHeight(vx + STEP, vz);
      const hD = iy > 0       ? heightCache[i - COLS]! : sampleHeight(vx, vz - STEP);
      const hU = iy < segments ? heightCache[i + COLS]! : sampleHeight(vx, vz + STEP);

      const dX = (hR - hL) / (2 * STEP);
      const dZ = (hU - hD) / (2 * STEP);
      let nx = -dX, ny = 1.0, nz = -dZ;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen; ny *= invLen; nz *= invLen;

      normalValues[i * 3]     = nx;
      normalValues[i * 3 + 1] = ny;
      normalValues[i * 3 + 2] = nz;
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normalValues, 3));

    // ── Pass 3: vertex colors using cached biome weights ─────────────────────
    const colors        = new Float32Array(vertexCount * 3);
    const emissiveColors = new Float32Array(vertexCount * 3);
    const normals = geometry.attributes.normal as THREE.BufferAttribute;

    const rockBaseR = 0x52 / 255;
    const rockBaseG = 0x4a / 255;
    const rockBaseB = 0x42 / 255;

    for (let i = 0; i < vertexCount; i++) {
      const vx = positions.getX(i);
      const vy = heightCache[i]!;
      const vz = positions.getZ(i);
      const t = THREE.MathUtils.clamp((vy + 3) / 25, 0, 1);

      const normalY  = normals.getY(i);
      const steepness = THREE.MathUtils.clamp((0.7 - normalY) / 0.5, 0, 1);

      const weights = biomeWeightsCache[i]!;

      const color = getBiomeColor(vx, vz, vy, t, weights);
      let r = color.r, g = color.g, b = color.b;

      const emberW  = weights[BiomeType.EmberWastes];
      const tundraW = weights[BiomeType.CrystalTundra];
      const rockR    = THREE.MathUtils.lerp(THREE.MathUtils.lerp(rockBaseR, 0x3a / 255, emberW), 0x6a / 255, tundraW);
      const rockG    = THREE.MathUtils.lerp(THREE.MathUtils.lerp(rockBaseG, 0x1a / 255, emberW), 0x88 / 255, tundraW);
      const rockBCol = THREE.MathUtils.lerp(THREE.MathUtils.lerp(rockBaseB, 0x08 / 255, emberW), 0x98 / 255, tundraW);

      r += (rockR    - r) * steepness;
      g += (rockG    - g) * steepness;
      b += (rockBCol - b) * steepness;

      const ao = 1.0 - THREE.MathUtils.clamp((-vy - 2) / 8, 0, 0.20);
      r *= ao; g *= ao; b *= ao;

      const noise =
        (Math.sin(vx * 1.7 + vz * 2.3) + Math.cos(vx * 3.1 - vz * 1.9)) * 0.02 +
        (Math.sin(vx * 4.3 - vz * 3.7) + Math.cos(vx * 2.9 + vz * 5.1)) * 0.015;
      const medNoise =
        (Math.sin(vx * 0.23 + vz * 0.31) + Math.cos(vx * 0.37 - vz * 0.27)) * 0.025;

      r = THREE.MathUtils.clamp(r + noise + medNoise,        0, 1);
      g = THREE.MathUtils.clamp(g + noise * 0.8 + medNoise * 0.9, 0, 1);
      b = THREE.MathUtils.clamp(b + noise * 0.6 + medNoise * 0.7, 0, 1);

      const surfNoise = getBiomeSurfaceNoise(vx, vz, weights);
      r = THREE.MathUtils.clamp(r + surfNoise.r, 0, 1);
      g = THREE.MathUtils.clamp(g + surfNoise.g, 0, 1);
      b = THREE.MathUtils.clamp(b + surfNoise.b, 0, 1);

      // Editor ground paint overrides the biome colour toward the chosen surface
      // type, keeping a little of the underlying noise so it doesn't read flat.
      if (chunkHasPaint) {
        const paint = sampleGroundPaint(vx, vz);
        if (paint) {
          r = r * (1 - paint.w) + paint.r * paint.w;
          g = g * (1 - paint.w) + paint.g * paint.w;
          b = b * (1 - paint.w) + paint.b * paint.w;
        }
      }

      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;

      const emissive = getBiomeEmissive(vx, vz, vy, t, weights);
      const emissiveScale = 1.0 - steepness;
      emissiveColors[i * 3]     = emissive.r * emissiveScale;
      emissiveColors[i * 3 + 1] = emissive.g * emissiveScale;
      emissiveColors[i * 3 + 2] = emissive.b * emissiveScale;
    }

    geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aEmissive', new THREE.BufferAttribute(emissiveColors, 3));

    // World-space tiling UVs — unchanged.
    const uvArray = new Float32Array(vertexCount * 2);
    for (let i = 0; i < vertexCount; i++) {
      uvArray[i * 2]     = positions.getX(i) * 0.5;
      uvArray[i * 2 + 1] = positions.getZ(i) * 0.5;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, getSharedMaterial());
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const key = `${cx},${cz}`;
    this.chunks.set(key, { mesh, cx, cz });

    if (this.onChunkLoaded) {
      this.onChunkLoaded(cx, cz, worldX, worldZ);
    }
  }

  public unloadChunk(key: string, chunk: ChunkData): void {
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    // Material is shared — do NOT dispose it here.
    this.chunks.delete(key);

    if (this.onChunkUnloaded) {
      this.onChunkUnloaded(chunk.cx, chunk.cz);
    }
  }
}
