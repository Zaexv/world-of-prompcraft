import * as THREE from 'three';
import {
  BiomeType,
  getBiomeWeights,
  biomeHeightModifier,
  getBiomeColor,
  getBiomeEmissive,
  getBiomeSurfaceNoise,
} from './Biomes';
import { getVerticalLiftAt } from './VerticalTerrain';

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
const CHUNK_SEGMENTS = 32;      // vertex subdivisions per chunk side
const VIEW_RADIUS = 3;          // chunks visible in each direction (7x7 = 49 chunks)
const UNLOAD_RADIUS = VIEW_RADIUS + 2; // buffer before disposal
const INITIAL_PRELOAD_RADIUS = 1; // smaller warm-up to reduce initial hitch
const CHUNK_LOADS_PER_UPDATE = 3; // throttle mesh generation per frame

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
  });

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

// ── Terrain class ────────────────────────────────────────────────────────────
export class Terrain {
  private scene: THREE.Scene;
  private chunks: Map<string, ChunkData> = new Map();
  private chunkLoadQueue: Array<{ cx: number; cz: number; key: string }> = [];
  private queuedChunkKeys: Set<string> = new Set();

  /** Called whenever a new chunk is created. Args: (chunkX, chunkZ, worldX, worldZ). */
  public onChunkLoaded: ((chunkX: number, chunkZ: number, worldX: number, worldZ: number) => void) | null = null;

  /** Called whenever a chunk is unloaded. Args: (chunkX, chunkZ). */
  public onChunkUnloaded: ((chunkX: number, chunkZ: number) => void) | null = null;

  // Track the last player chunk so we only recompute when the player crosses
  // into a new chunk.
  private lastPlayerCX = Number.MAX_SAFE_INTEGER;
  private lastPlayerCZ = Number.MAX_SAFE_INTEGER;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Lightweight warm-up near spawn; remaining chunks stream in across frames.
    this.queueChunksAround(0, 0, INITIAL_PRELOAD_RADIUS);
    this.processChunkQueue(CHUNK_LOADS_PER_UPDATE * 2);
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
    return Terrain.computeHeight(x, z) + getVerticalLiftAt(x, z);
  }

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

      // Rebuild and prioritize queue around the new center chunk so zone
      // transitions fill nearby terrain first and avoid visible holes.
      this.chunkLoadQueue = [];
      this.queuedChunkKeys.clear();
      this.queueChunksAround(cx, cz, VIEW_RADIUS);
    }

    // Stream a small batch each frame to avoid long main-thread stalls.
    this.processChunkQueue(chunkChanged ? CHUNK_LOADS_PER_UPDATE * 3 : CHUNK_LOADS_PER_UPDATE);

    if (chunkChanged) {
      // --- Unload chunks outside unload radius ---
      for (const [key, chunk] of this.chunks) {
        const dx = chunk.cx - cx;
        const dz = chunk.cz - cz;
        if (Math.abs(dx) > UNLOAD_RADIUS || Math.abs(dz) > UNLOAD_RADIUS) {
          this.unloadChunk(key, chunk);
        }
      }
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

  private processChunkQueue(maxLoads = CHUNK_LOADS_PER_UPDATE): void {
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
  static computeHeight(x: number, z: number): number {
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

    // Fort Malaka city platform — smoothly flatten terrain so buildings sit flush
    {
      const fx = x + 160;
      const fz = z + 220;
      const fDist = Math.sqrt(fx * fx + fz * fz);
      const INNER = 65, OUTER = 120;
      if (fDist < OUTER) {
        const raw = Math.max(0, Math.min(1, (fDist - INNER) / (OUTER - INNER)));
        const flatness = 1 - raw * raw * (3 - 2 * raw); // smoothstep, 1=flat at centre
        h *= 1 - flatness;
      }
    }

    // Blend in biome-specific height modifications
    const weights = getBiomeWeights(x, z);
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

  private loadChunk(cx: number, cz: number): void {
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;

    // Use a single subdivision density for all chunks to avoid LOD edge cracks.
    const segments = CHUNK_SEGMENTS;

    const geometry = new THREE.PlaneGeometry(
      CHUNK_SIZE,
      CHUNK_SIZE,
      segments,
      segments,
    );

    // Rotate so that X/Z is the ground plane
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const vertexCount = positions.count;

    // --- Apply heightmap ---
    // After rotateX(-PI/2), the original local X stays as world X,
    // and the original local Y becomes world Z (negated), but Three.js
    // PlaneGeometry vertices after rotation: getX → local X, getZ → local Z.
    // The plane is centred at local origin, so we offset by the chunk world pos.
    for (let i = 0; i < vertexCount; i++) {
      const lx = positions.getX(i) + worldX + CHUNK_SIZE * 0.5;
      const lz = positions.getZ(i) + worldZ + CHUNK_SIZE * 0.5;
      positions.setX(i, lx);
      positions.setZ(i, lz);
      // Use full world height (terrain noise + vertical lift) so the mesh
      // visually matches the height used by PlayerController.
      positions.setY(i, Terrain.computeHeight(lx, lz) + getVerticalLiftAt(lx, lz));
    }

    positions.needsUpdate = true;

    // World-space normal reconstruction (central differences) keeps lighting
    // continuous across chunk borders, avoiding visible seam lines.
    const normalValues = new Float32Array(vertexCount * 3);
    const normalSampleStep = 0.75;
    for (let i = 0; i < vertexCount; i++) {
      const vx = positions.getX(i);
      const vz = positions.getZ(i);
      // Sample full world height (noise + lift) for accurate slope normals on hills.
      const hL = Terrain.computeHeight(vx - normalSampleStep, vz) + getVerticalLiftAt(vx - normalSampleStep, vz);
      const hR = Terrain.computeHeight(vx + normalSampleStep, vz) + getVerticalLiftAt(vx + normalSampleStep, vz);
      const hD = Terrain.computeHeight(vx, vz - normalSampleStep) + getVerticalLiftAt(vx, vz - normalSampleStep);
      const hU = Terrain.computeHeight(vx, vz + normalSampleStep) + getVerticalLiftAt(vx, vz + normalSampleStep);

      const dX = (hR - hL) / (2 * normalSampleStep);
      const dZ = (hU - hD) / (2 * normalSampleStep);

      let nx = -dX;
      let ny = 1.0;
      let nz = -dZ;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      normalValues[i * 3] = nx;
      normalValues[i * 3 + 1] = ny;
      normalValues[i * 3 + 2] = nz;
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normalValues, 3));

    // --- Vertex colors (biome-blended palette) ---
    const colors = new Float32Array(vertexCount * 3);
    const emissiveColors = new Float32Array(vertexCount * 3);
    const normals = geometry.attributes.normal as THREE.BufferAttribute;

    // Base rock color (warm gray-brown) — blended with biome-specific rock below
    const rockBaseR = 0x52 / 255;
    const rockBaseG = 0x4a / 255;
    const rockBaseB = 0x42 / 255;

    for (let i = 0; i < vertexCount; i++) {
      const vx = positions.getX(i);
      const vy = positions.getY(i);
      const vz = positions.getZ(i);
      const t = THREE.MathUtils.clamp((vy + 3) / 25, 0, 1);

      // Steepness from vertex normal Y component (1=flat, 0=vertical cliff)
      const normalY = normals.getY(i);
      const steepness = THREE.MathUtils.clamp((0.7 - normalY) / 0.5, 0, 1);

      // --- Base color (biome-blended, smoothstep bands) ---
      const color = getBiomeColor(vx, vz, vy, t);
      let r = color.r;
      let g = color.g;
      let b = color.b;

      // --- Biome-aware rock color (EmberWastes = dark red, Tundra = gray-blue, others = base) ---
      const biomeWeights = getBiomeWeights(vx, vz);
      const emberW = biomeWeights[BiomeType.EmberWastes];
      const tundraW = biomeWeights[BiomeType.CrystalTundra];
      const rockR = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(rockBaseR, 0x3a / 255, emberW),
        0x6a / 255,
        tundraW,
      );
      const rockG = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(rockBaseG, 0x1a / 255, emberW),
        0x88 / 255,
        tundraW,
      );
      const rockBCol = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(rockBaseB, 0x08 / 255, emberW),
        0x98 / 255,
        tundraW,
      );

      // Blend toward biome rock color on steep faces
      r += (rockR - r) * steepness;
      g += (rockG - g) * steepness;
      b += (rockBCol - b) * steepness;

      // Fake AO: darken valleys up to 20%
      const ao = 1.0 - THREE.MathUtils.clamp((-vy - 2) / 8, 0, 0.20);
      r *= ao;
      g *= ao;
      b *= ao;

      // Dual-frequency micro-noise: two layers break the single-period tiling stripe
      const noise =
        (Math.sin(vx * 1.7 + vz * 2.3) + Math.cos(vx * 3.1 - vz * 1.9)) * 0.02 +
        (Math.sin(vx * 4.3 - vz * 3.7) + Math.cos(vx * 2.9 + vz * 5.1)) * 0.015;
      // Medium-frequency layer: breaks up wide flat areas
      const medNoise =
        (Math.sin(vx * 0.23 + vz * 0.31) + Math.cos(vx * 0.37 - vz * 0.27)) * 0.025;

      r = THREE.MathUtils.clamp(r + noise + medNoise, 0, 1);
      g = THREE.MathUtils.clamp(g + noise * 0.8 + medNoise * 0.9, 0, 1);
      b = THREE.MathUtils.clamp(b + noise * 0.6 + medNoise * 0.7, 0, 1);

      // Biome surface noise: ember flecks, frost sparkle, bog patches, etc.
      const surfNoise = getBiomeSurfaceNoise(vx, vz, biomeWeights);
      r = THREE.MathUtils.clamp(r + surfNoise.r, 0, 1);
      g = THREE.MathUtils.clamp(g + surfNoise.g, 0, 1);
      b = THREE.MathUtils.clamp(b + surfNoise.b, 0, 1);

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;

      // --- Per-vertex emissive — suppressed on steep rock faces ---
      const emissive = getBiomeEmissive(vx, vz, vy, t);
      const emissiveScale = 1.0 - steepness;
      emissiveColors[i * 3] = emissive.r * emissiveScale;
      emissiveColors[i * 3 + 1] = emissive.g * emissiveScale;
      emissiveColors[i * 3 + 2] = emissive.b * emissiveScale;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aEmissive', new THREE.BufferAttribute(emissiveColors, 3));

    // Compute a proper bounding box so frustum culling works per-chunk.
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, getSharedMaterial());
    mesh.receiveShadow = true;

    this.scene.add(mesh);
    const key = `${cx},${cz}`;
    this.chunks.set(key, { mesh, cx, cz });

    // Notify listeners about the new chunk
    if (this.onChunkLoaded) {
      this.onChunkLoaded(cx, cz, worldX, worldZ);
    }
  }

  private unloadChunk(key: string, chunk: ChunkData): void {
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    // Material is shared — do NOT dispose it here.
    this.chunks.delete(key);

    if (this.onChunkUnloaded) {
      this.onChunkUnloaded(chunk.cx, chunk.cz);
    }
  }
}
