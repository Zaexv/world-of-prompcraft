import * as THREE from 'three';

/**
 * Infinite procedural Teldrassil terrain with chunk-based loading.
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
const VIEW_RADIUS = 5;          // chunks visible in each direction
const UNLOAD_RADIUS = VIEW_RADIUS + 2; // buffer before disposal

// ── Shared material (created once, reused for every chunk) ───────────────────
let sharedMaterial: THREE.MeshStandardMaterial | null = null;

function getSharedMaterial(): THREE.MeshStandardMaterial {
  if (sharedMaterial) return sharedMaterial;

  sharedMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
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

  /** Called whenever a new chunk is created. Args: (chunkX, chunkZ, worldX, worldZ). */
  public onChunkLoaded: ((chunkX: number, chunkZ: number, worldX: number, worldZ: number) => void) | null = null;

  // Track the last player chunk so we only recompute when the player crosses
  // into a new chunk.
  private lastPlayerCX = Number.MAX_SAFE_INTEGER;
  private lastPlayerCZ = Number.MAX_SAFE_INTEGER;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-load chunks around the origin so everything placed at startup
    // (buildings, vegetation, NPCs) has terrain underneath.
    this.update(0, 0);
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the deterministic terrain height at any world (x, z).
   * Does NOT depend on loaded chunks — pure math.
   */
  getHeightAt(x: number, z: number): number {
    return Terrain.computeHeight(x, z);
  }

  /**
   * Call each frame with the player's world position.
   * Loads missing chunks within view radius, unloads distant ones.
   */
  update(playerX: number, playerZ: number): void {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);

    // Skip work if the player is still in the same chunk.
    if (cx === this.lastPlayerCX && cz === this.lastPlayerCZ) return;
    this.lastPlayerCX = cx;
    this.lastPlayerCZ = cz;

    // --- Load missing chunks within view radius ---
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!this.chunks.has(key)) {
          this.loadChunk(cx + dx, cz + dz);
        }
      }
    }

    // --- Unload chunks outside unload radius ---
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - cx;
      const dz = chunk.cz - cz;
      if (Math.abs(dx) > UNLOAD_RADIUS || Math.abs(dz) > UNLOAD_RADIUS) {
        this.unloadChunk(key, chunk);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Noise function (static so it can be used without an instance)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Multi-octave sin/cos noise — deterministic for any (x, z).
   * This is the single source of truth for terrain height everywhere.
   */
  static computeHeight(x: number, z: number): number {
    let h = 0;

    // Large rolling hills
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
    h += Math.sin(x * 0.08 + 4.0) * Math.cos(z * 0.07 - 2.0) * 0.6;
    h += Math.cos(x * 0.09 - 1.5) * Math.sin(z * 0.1 + 3.0) * 0.4;

    // Very fine detail (root-like bumps)
    h += Math.sin(x * 0.15 + 1.1) * Math.cos(z * 0.13 - 3.2) * 0.2;

    return h;
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Chunk lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  private loadChunk(cx: number, cz: number): void {
    const worldX = cx * CHUNK_SIZE;
    const worldZ = cz * CHUNK_SIZE;

    const geometry = new THREE.PlaneGeometry(
      CHUNK_SIZE,
      CHUNK_SIZE,
      CHUNK_SEGMENTS,
      CHUNK_SEGMENTS,
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
      positions.setY(i, Terrain.computeHeight(lx, lz));
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    // --- Vertex colors (Teldrassil palette) ---
    const colors = new Float32Array(vertexCount * 3);
    const emissiveColors = new Float32Array(vertexCount * 3);
    const color = new THREE.Color();
    const emissiveColor = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
      const y = positions.getY(i);
      const t = THREE.MathUtils.clamp((y + 3) / 25, 0, 1);

      // --- Base color ---
      if (t < 0.3) {
        const u = t / 0.3;
        const darkPurpleMoss = new THREE.Color(0x1a2a1f);
        const deepGreenPurple = new THREE.Color(0x2a4a2e);
        color.copy(darkPurpleMoss).lerp(deepGreenPurple, u);
        const purpleTint = new THREE.Color(0x331a44);
        color.lerp(purpleTint, 0.25 * (1.0 - u));
      } else if (t < 0.55) {
        const u = (t - 0.3) / 0.25;
        color.set(0x2a4a2e).lerp(new THREE.Color(0x3a2e1f), u);
      } else if (t < 0.75) {
        const u = (t - 0.55) / 0.2;
        color.set(0x3a2e1f).lerp(new THREE.Color(0x555566), u);
      } else {
        const u = (t - 0.75) / 0.25;
        color.set(0x555566).lerp(new THREE.Color(0x6a6a7a), u);
      }

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // --- Per-vertex emissive (bioluminescent glow in valleys) ---
      if (t < 0.25) {
        const glowStrength = (1.0 - t / 0.25) * 0.15;
        emissiveColor.set(0x4422aa).lerp(new THREE.Color(0x225566), t / 0.25);
        emissiveColors[i * 3] = emissiveColor.r * glowStrength;
        emissiveColors[i * 3 + 1] = emissiveColor.g * glowStrength;
        emissiveColors[i * 3 + 2] = emissiveColor.b * glowStrength;
      }
      // else stays 0 (Float32Array is zero-initialised)
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
  }
}
