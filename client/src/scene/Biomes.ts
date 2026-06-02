import * as THREE from 'three';
import type { WorldManifest, PathDefinition } from '../state/WorldManifest';
import { FOOTPRINT_SPECS } from './Terrain';

let worldManifest: WorldManifest | null = null;

// ── Cached env params (computed once on first use, invalidated on manifest change) ─
// Avoids calling worldManifest.getEnvironment() + optional-chaining on every vertex.
let _biomeStart     = 120;
let _transitionWidth = 100;
let _biomeAmplitudes: Record<string, number> = {};
let _envCached = false;

/** Spatial index for paths: Map<"chunkX,chunkZ", PathDefinition[]> */
const _pathSpatialIndex: Map<string, PathDefinition[]> = new Map();
const _PATH_CHUNK_SIZE = 64; // Match Terrain.ts

interface GrassPatch {
  x: number;
  z: number;
  inner: number;
  outer: number;
  
  // OBB support
  shape: 'circle' | 'rect';
  width?: number;
  depth?: number;
  rotation?: number;
  blendWidth?: number;
}
let _manifestGrassPatches: GrassPatch[] = [];

function _cacheEnv(): void {
  if (_envCached) return;
  const env = worldManifest?.getEnvironment();
  _biomeStart      = env?.biome_start      ?? 120;
  _transitionWidth = env?.transition_width ?? 100;
  _biomeAmplitudes = {};
  if (env?.biomes) {
    for (const [k, v] of Object.entries(env.biomes)) {
      _biomeAmplitudes[k] = v.height_modifier_amplitude ?? 1.0;
    }
  }

  // Rebuild path spatial index
  _pathSpatialIndex.clear();
  const paths = worldManifest?.getPaths?.() ?? [];
  for (const path of paths) {
    const minX = Math.min(path.start[0], path.end[0]) - path.width;
    const maxX = Math.max(path.start[0], path.end[0]) + path.width;
    const minZ = Math.min(path.start[1], path.end[1]) - path.width;
    const maxZ = Math.max(path.start[1], path.end[1]) + path.width;

    const startCX = Math.floor(minX / _PATH_CHUNK_SIZE);
    const endCX   = Math.floor(maxX / _PATH_CHUNK_SIZE);
    const startCZ = Math.floor(minZ / _PATH_CHUNK_SIZE);
    const endCZ   = Math.floor(maxZ / _PATH_CHUNK_SIZE);

    for (let cx = startCX; cx <= endCX; cx++) {
      for (let cz = startCZ; cz <= endCZ; cz++) {
        const key = `${cx},${cz}`;
        if (!_pathSpatialIndex.has(key)) _pathSpatialIndex.set(key, []);
        _pathSpatialIndex.get(key)!.push(path);
      }
    }
  }

  // Cache grass patches from topology
  _manifestGrassPatches = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = (worldManifest as any)?.world ?? {};
  const rawFeatures = rawData.topology?.features ?? [];
  for (const f of rawFeatures) {
    if (f.type === 'grass_patch' || f.type === 'flat_patch') {
      const shape = f.shape ?? 'circle';
      if (shape === 'circle') {
        _manifestGrassPatches.push({
          x: f.transform.x,
          z: f.transform.z,
          inner: f.radii.inner,
          outer: f.radii.outer,
          shape: 'circle',
        });
      } else {
        const width = f.width ?? (f.radii.inner * 2);
        const depth = f.depth ?? (f.radii.inner * 2);
        const rotation = f.transform?.rotation ?? f.rotation ?? 0;
        const blendWidth = f.blendWidth ?? 14;
        const innerRadius = Math.sqrt(width * width + depth * depth) / 2;
        _manifestGrassPatches.push({
          x: f.transform.x,
          z: f.transform.z,
          shape: 'rect',
          width,
          depth,
          rotation,
          inner: 0,
          blendWidth,
          outer: innerRadius + blendWidth,
        });
      }
    }
  }

  // Also check all landmarks for 'grass_patch' metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zones = (worldManifest as any)?.zones ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const zone of Object.values(zones) as any[]) {
    if (zone.architecture?.landmarks) {
      for (const l of zone.architecture.landmarks) {
        if (l.visual?.metadata?.grass_patch === true) {
          const spec = l.visual?.metadata?.footprint ?? FOOTPRINT_SPECS[l.type];
          if (spec) {
            const scale = l.transform.scale ?? 1.0;
            const rotation = l.transform.rotation ? l.transform.rotation[1] : 0;
            
            if (spec.shape === 'circle') {
              const inner = (spec.radius ?? 1) * scale;
              _manifestGrassPatches.push({
                x: l.transform.position[0],
                z: l.transform.position[2],
                shape: 'circle',
                inner,
                outer: inner + 14,
              });
            } else {
              const width = (spec.width ?? 1) * scale;
              const depth = (spec.depth ?? 1) * scale;
              const blendWidth = 14;
              const innerRadius = Math.sqrt(width * width + depth * depth) / 2;
              _manifestGrassPatches.push({
                x: l.transform.position[0],
                z: l.transform.position[2],
                shape: 'rect',
                width,
                depth,
                rotation,
                inner: 0,
                blendWidth,
                outer: innerRadius + blendWidth,
              });
            }
          }
        }
      }
    }
  }

  _envCached = true;
}

export function setWorldManifest(wm: WorldManifest): void {
  worldManifest = wm;
  _envCached = false; // invalidate so next call re-reads from the new manifest
}

function distToSegment(x: number, z: number, startX: number, startZ: number, endX: number, endZ: number): number {
  const l2 = (endX - startX) * (endX - startX) + (endZ - startZ) * (endZ - startZ);
  if (l2 === 0) return Math.sqrt((x - startX) * (x - startX) + (z - startZ) * (z - startZ));
  let t = ((x - startX) * (endX - startX) + (z - startZ) * (endZ - startZ)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((x - (startX + t * (endX - startX))) * (x - (startX + t * (endX - startX))) +
    (z - (startZ + t * (endZ - startZ))) * (z - (startZ + t * (endZ - startZ))));
}

/**
 * Biome system for World of Promptcraft.
 *
 * Five ecosystems blend smoothly based on world position.
 */

export enum BiomeType {
  Teldrassil = 0,
  EmberWastes = 1,
  CrystalTundra = 2,
  TwilightMarsh = 3,
  SunlitMeadows = 4,
  Desert = 5,
}

export interface BiomeWeights {
  [BiomeType.Teldrassil]: number;
  [BiomeType.EmberWastes]: number;
  [BiomeType.CrystalTundra]: number;
  [BiomeType.TwilightMarsh]: number;
  [BiomeType.SunlitMeadows]: number;
  [BiomeType.Desert]: number;
}

/**
 * Returns a weight [0..1] for each biome at a given world (x, z).
 * Weights always sum to 1.
 */
export function getBiomeWeights(x: number, z: number): BiomeWeights {
  _cacheEnv();

  const weights: BiomeWeights = {
    [BiomeType.Teldrassil]: 0,
    [BiomeType.EmberWastes]: 0,
    [BiomeType.CrystalTundra]: 0,
    [BiomeType.TwilightMarsh]: 0,
    [BiomeType.SunlitMeadows]: 0,
    [BiomeType.Desert]: 0,
  };

  // Distance from origin
  const dist = Math.sqrt(x * x + z * z);

  // Continuous transition factor [0..1] from center (0) to outer (1)
  const transitionT = THREE.MathUtils.clamp((dist - (_biomeStart - _transitionWidth)) / _transitionWidth, 0, 1);
  const centerWeight = 1.0 - transitionT;
  const outerWeight = transitionT;

  // Directional biome strengths based on angle
  const angle = Math.atan2(z, x); // -PI..PI; 0=east, PI/2=north, -PI/2=south, PI=west

  const ember = directionalWeight(angle, 0);              // east
  const tundra = directionalWeight(angle, Math.PI / 2);   // north
  const meadows = directionalWeight(angle, Math.PI);      // west (also handle -PI)
  const meadowsNeg = directionalWeight(angle, -Math.PI);
  const marsh = directionalWeight(angle, -Math.PI / 2);   // south
  const desertMask = THREE.MathUtils.clamp(
    ((Math.max(Math.abs(x), Math.abs(z)) - 280) / 180) * ((Math.min(Math.abs(x), Math.abs(z)) - 220) / 160),
    0,
    1,
  );

  weights[BiomeType.Teldrassil] = centerWeight;
  weights[BiomeType.EmberWastes] = ember * outerWeight;
  weights[BiomeType.CrystalTundra] = tundra * outerWeight;
  weights[BiomeType.TwilightMarsh] = marsh * outerWeight;
  weights[BiomeType.SunlitMeadows] = Math.max(meadows, meadowsNeg) * outerWeight;
  weights[BiomeType.Desert] = desertMask * outerWeight;

  // Normalize so weights sum to 1
  const total =
    weights[BiomeType.Teldrassil] +
    weights[BiomeType.EmberWastes] +
    weights[BiomeType.CrystalTundra] +
    weights[BiomeType.TwilightMarsh] +
    weights[BiomeType.SunlitMeadows] +
    weights[BiomeType.Desert];

  if (total > 0.0001) {
    weights[BiomeType.Teldrassil] /= total;
    weights[BiomeType.EmberWastes] /= total;
    weights[BiomeType.CrystalTundra] /= total;
    weights[BiomeType.TwilightMarsh] /= total;
    weights[BiomeType.SunlitMeadows] /= total;
    weights[BiomeType.Desert] /= total;
  } else {
    weights[BiomeType.Teldrassil] = 1;
  }

  return weights;
}

/** Returns the dominant biome at a position. */
export function getDominantBiome(x: number, z: number): BiomeType {
  const w = getBiomeWeights(x, z);
  let best = BiomeType.Teldrassil;
  let bestVal = 0;
  for (const key of [
    BiomeType.Teldrassil,
    BiomeType.EmberWastes,
    BiomeType.CrystalTundra,
    BiomeType.TwilightMarsh,
    BiomeType.SunlitMeadows,
    BiomeType.Desert,
  ]) {
    if (w[key] > bestVal) {
      bestVal = w[key];
      best = key;
    }
  }
  return best;
}

/**
 * Smooth directional weight — peaks at `targetAngle` and falls off
 * with roughly a 90-degree half-width using a raised cosine.
 */
function directionalWeight(angle: number, targetAngle: number): number {
  let diff = angle - targetAngle;
  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  // Raised cosine over a ~110-degree half-width (slightly overlapping for smooth blends)
  const halfWidth = Math.PI * 0.6; // ~108 degrees
  if (Math.abs(diff) > halfWidth) return 0;
  return 0.5 + 0.5 * Math.cos((diff / halfWidth) * Math.PI);
}

// ── Biome height modifiers ──────────────────────────────────────────────────

/** Per-biome height contribution. Blended by weights in Terrain. */
export function biomeHeightModifier(x: number, z: number, biome: BiomeType): number {
  _cacheEnv();
  const amplitude = _biomeAmplitudes[getBiomeKey(biome)] ?? 1.0;

  switch (biome) {
    case BiomeType.Teldrassil:
      return 0; // base terrain unchanged
    case BiomeType.EmberWastes:
      // Steeper, jagged volcanic terrain
      return (
        (Math.sin(x * 0.02 + 5.0) * Math.cos(z * 0.025 - 2.0) * 6 +
          Math.abs(Math.sin(x * 0.06) * Math.cos(z * 0.07)) * 4 +
          Math.sin(x * 0.12 + z * 0.08) * 2) * amplitude
      );
    case BiomeType.CrystalTundra:
      // High peaks and plateaus
      return (
        (Math.abs(Math.sin(x * 0.008 + 1.0) * Math.cos(z * 0.01 - 0.5)) * 12 +
          Math.sin(x * 0.03 + z * 0.02) * 3) * amplitude
      );
    case BiomeType.TwilightMarsh:
      // Very flat, low terrain with slight undulation
      return (
        (-Math.abs(Math.sin(x * 0.01) * Math.cos(z * 0.012)) * 5 +
          Math.sin(x * 0.04 + z * 0.05) * 0.5 - 2) * amplitude
      );
    case BiomeType.SunlitMeadows:
      // Gentle rolling hills
      return (
        (Math.sin(x * 0.015 + 3.0) * Math.cos(z * 0.018 + 1.0) * 3 +
          Math.sin(x * 0.04 - 1.0) * Math.cos(z * 0.035 + 2.0) * 1.5) * amplitude
      );
    case BiomeType.Desert:
      // Low dunes and ridges
      return (
        (Math.sin(x * 0.012 + 1.7) * Math.cos(z * 0.014 - 0.9) * 2.5 +
          Math.sin(x * 0.03 + z * 0.02) * 1.1 +
          Math.abs(Math.sin(x * 0.05 - z * 0.04)) * 0.8 - 1.0) * amplitude
      );
  }
}

function getBiomeKey(biome: BiomeType): string {
  switch (biome) {
    case BiomeType.Teldrassil: return 'teldrassil';
    case BiomeType.EmberWastes: return 'ember_wastes';
    case BiomeType.CrystalTundra: return 'crystal_tundra';
    case BiomeType.TwilightMarsh: return 'twilight_marsh';
    case BiomeType.SunlitMeadows: return 'sunlit_meadows';
    case BiomeType.Desert: return 'desert';
  }
}

// ── Biome color palettes ────────────────────────────────────────────────────

interface BiomeColors {
  low: THREE.Color;
  mid: THREE.Color;
  high: THREE.Color;
  peak: THREE.Color;
}

const DEFAULT_PALETTES: Record<BiomeType, BiomeColors> = {
  [BiomeType.Teldrassil]: {
    low: new THREE.Color(0x1a2a1f),
    mid: new THREE.Color(0x2a4a2e),
    high: new THREE.Color(0x3a2e1f),
    peak: new THREE.Color(0x555566),
  },
  [BiomeType.EmberWastes]: {
    low: new THREE.Color(0x2a1008),
    mid: new THREE.Color(0x4a2010),
    high: new THREE.Color(0x3a2a1a),
    peak: new THREE.Color(0x555044),
  },
  [BiomeType.CrystalTundra]: {
    low: new THREE.Color(0x4a5a6a),
    mid: new THREE.Color(0x6a7a8a),
    high: new THREE.Color(0x8a9aaa),
    peak: new THREE.Color(0xc0d0e0),
  },
  [BiomeType.TwilightMarsh]: {
    low: new THREE.Color(0x0a1a0a),
    mid: new THREE.Color(0x1a2a15),
    high: new THREE.Color(0x2a3a20),
    peak: new THREE.Color(0x3a4a30),
  },
  [BiomeType.SunlitMeadows]: {
    low: new THREE.Color(0x3a4a1a),
    mid: new THREE.Color(0x5a6a2a),
    high: new THREE.Color(0x7a7a3a),
    peak: new THREE.Color(0x8a8a5a),
  },
  [BiomeType.Desert]: {
    low: new THREE.Color(0x8d6a39),
    mid: new THREE.Color(0xbb8f4f),
    high: new THREE.Color(0xe0b86c),
    peak: new THREE.Color(0xf7e0b0),
  },
};

/**
 * Returns a blended terrain color for a position and height, considering biome weights.
 */
const _colorResult = new THREE.Color();
const _colorTemp = new THREE.Color();

const _biomeKeys = [
  BiomeType.Teldrassil,
  BiomeType.EmberWastes,
  BiomeType.CrystalTundra,
  BiomeType.TwilightMarsh,
  BiomeType.SunlitMeadows,
  BiomeType.Desert,
] as const;

// Lazily-populated cache so manifest Color objects are allocated once, not per vertex.
const _manifestPaletteCache = new Map<string, BiomeColors>();
const _roadColor = new THREE.Color(0x8a8270);
const _roadStoneColor = new THREE.Color(0x333333);

/** Smoothstep: eliminates linear transition terracing by using a cubic ease. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function getBiomeColor(x: number, z: number, y: number, t: number, cachedWeights?: BiomeWeights): THREE.Color {
  _cacheEnv();
  const weights = cachedWeights ?? getBiomeWeights(x, z);
  const env = worldManifest?.getEnvironment();
  _colorResult.setRGB(0, 0, 0);

  for (const biome of _biomeKeys) {
    const w = weights[biome];
    if (w < 0.001) continue;

    const biomeKey = getBiomeKey(biome);
    const manifestColors = env?.biomes[biomeKey]?.colors;

    let p: BiomeColors;
    if (manifestColors) {
      let cached = _manifestPaletteCache.get(biomeKey);
      if (!cached) {
        cached = {
          low:  new THREE.Color(manifestColors.low[0]  / 255, manifestColors.low[1]  / 255, manifestColors.low[2]  / 255),
          mid:  new THREE.Color(manifestColors.mid[0]  / 255, manifestColors.mid[1]  / 255, manifestColors.mid[2]  / 255),
          high: new THREE.Color(manifestColors.high[0] / 255, manifestColors.high[1] / 255, manifestColors.high[2] / 255),
          peak: new THREE.Color(manifestColors.peak[0] / 255, manifestColors.peak[1] / 255, manifestColors.peak[2] / 255),
        };
        _manifestPaletteCache.set(biomeKey, cached);
      }
      p = cached;
    } else {
      p = DEFAULT_PALETTES[biome];
    }

    if (t < 0.2) {
      _colorTemp.copy(p.low).lerp(p.mid, smoothstep(0, 0.2, t));
    } else if (t < 0.45) {
      _colorTemp.copy(p.mid).lerp(p.high, smoothstep(0.2, 0.45, t));
    } else if (t < 0.65) {
      _colorTemp.copy(p.high).lerp(p.peak, smoothstep(0.45, 0.65, t));
    } else if (t < 0.82) {
      _colorTemp.copy(p.peak).lerp(p.peak, smoothstep(0.65, 0.82, t));
      _colorTemp.r = Math.min(1, _colorTemp.r + smoothstep(0.65, 0.82, t) * 0.06);
      _colorTemp.g = Math.min(1, _colorTemp.g + smoothstep(0.65, 0.82, t) * 0.05);
      _colorTemp.b = Math.min(1, _colorTemp.b + smoothstep(0.65, 0.82, t) * 0.07);
    } else {
      _colorTemp.copy(p.peak);
    }

    _colorResult.r += _colorTemp.r * w;
    _colorResult.g += _colorTemp.g * w;
    _colorResult.b += _colorTemp.b * w;
  }

  // --- Manifest-driven Grass Patches ---
  let grassBlend = 0;
  for (const p of _manifestGrassPatches) {
    let b = 0;
    if (p.shape === 'circle') {
      const dist = Math.hypot(x - p.x, z - p.z);
      if (dist < p.outer) {
        b = 1.0 - smoothstep(p.inner, p.outer, dist);
      }
    } else {
      // OBB logic for grass
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
      const blendWidth = p.blendWidth ?? 14; // Standard PAD_BLEND
      if (dist < blendWidth) {
        b = 1.0 - (dist / blendWidth) * (dist / blendWidth) * (3 - 2 * (dist / blendWidth));
      }
    }
    grassBlend = Math.max(grassBlend, b);
  }
  if (grassBlend > 0) {
    const grassColor = _colorTemp.setHex(0x3a5a2a); // Lush Mediterranean Green
    _colorResult.lerp(grassColor, grassBlend * 0.9);
  }

  // Paint roads on the terrain using spatial index
  const cx = Math.floor(x / _PATH_CHUNK_SIZE);
  const cz = Math.floor(z / _PATH_CHUNK_SIZE);
  const paths = _pathSpatialIndex.get(`${cx},${cz}`) ?? [];
  
  let roadBlend = 0;
  for (const path of paths) {
    const d = distToSegment(x, z, path.start[0], path.start[1], path.end[0], path.end[1]);
    if (d < path.width) {
      // Smooth fade out at the edges
      const blend = 1 - (d / path.width);
      roadBlend = Math.max(roadBlend, blend * blend);
    }
  }

  if (roadBlend > 0) {
    // Advanced Cobblestone Shader Math
    // We use a multi-frequency sine wave to simulate interlocking stones
    const stoneScale = 1.8;
    const stoneX = x * stoneScale;
    const stoneZ = z * stoneScale;

    // Interlocking grid pattern
    const pattern = Math.abs(Math.sin(stoneX) * Math.sin(stoneZ));
    const grout = smoothstep(0.7, 0.9, pattern); // Dark gaps between stones

    _roadColor.setHex(0x8a8270);
    const stoneVariation = (Math.sin(stoneX * 0.5) + Math.cos(stoneZ * 0.5)) * 0.05;

    _roadColor.r += stoneVariation;
    _roadColor.g += stoneVariation;
    _roadColor.b += stoneVariation;

    // Apply grout (darken the gaps)
    _roadColor.lerp(_roadStoneColor, grout * 0.6);

    // Add dirt/weathering noise
    const dirt = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.04;
    _roadColor.r += dirt;
    _roadColor.g += dirt;

    _colorResult.lerp(_roadColor, roadBlend * 0.9);
  }

  return _colorResult;
}


/**
 * Returns a per-biome surface noise value [-1..1] at (x, z).
 */

// Here the biome surface is generated, TODO -> Rework This 
export function getBiomeSurfaceNoise(
  x: number,
  z: number,
  weights: BiomeWeights,
): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;

  if (weights[BiomeType.Teldrassil] > 0.01) {
    const w = weights[BiomeType.Teldrassil];
    const spot = Math.sin(x * 0.9 + 1.3) * Math.cos(z * 1.1 - 0.7) * 0.03;
    r += spot * -0.3 * w;
    g += spot * 0.5 * w;
    b += spot * 0.8 * w;
  }

  if (weights[BiomeType.EmberWastes] > 0.01) {
    const w = weights[BiomeType.EmberWastes];
    const ember = Math.max(0, Math.sin(x * 2.3 + 0.5) * Math.cos(z * 1.9 - 1.2)) * 0.05;
    r += ember * 1.0 * w;
    g += ember * 0.25 * w;
    b += ember * 0.0 * w;
  }

  if (weights[BiomeType.TwilightMarsh] > 0.01) {
    const w = weights[BiomeType.TwilightMarsh];
    const bog = Math.sin(x * 0.7 + 2.1) * Math.sin(z * 0.8 - 0.9) * 0.04;
    r += bog * 0.3 * w;
    g += bog * 0.6 * w;
    b += bog * 0.5 * w;
  }

  if (weights[BiomeType.SunlitMeadows] > 0.01) {
    const w = weights[BiomeType.SunlitMeadows];
    const flower = Math.cos(x * 1.5 + 0.8) * Math.cos(z * 2.1 - 1.4) * 0.03;
    r += flower * 0.9 * w;
    g += flower * 0.7 * w;
    b += flower * 0.1 * w;
  }

  if (weights[BiomeType.Desert] > 0.01) {
    const w = weights[BiomeType.Desert];
    const ripple = Math.abs(Math.sin(x * 0.14 + z * 0.11)) * 0.03;
    const dune = Math.max(0, Math.sin(x * 0.05 + z * 0.04)) * 0.035;
    r += (0.03 + ripple * 0.9 + dune * 0.6) * w;
    g += (0.02 + ripple * 0.5 + dune * 0.35) * w;
    b += (0.01 + ripple * 0.15) * w;
  }

  return { r, g, b };
}

// ── Biome emissive glow ─────────────────────────────────────────────────────

const _emissiveResult = new THREE.Color();

export function getBiomeEmissive(x: number, z: number, y: number, t: number, cachedWeights?: BiomeWeights): THREE.Color {
  const weights = cachedWeights ?? getBiomeWeights(x, z);
  _emissiveResult.setRGB(0, 0, 0);

  // Teldrassil (spawn) ground has no emissive glow — the world is in daytime,
  // so the floor is lit purely by the warm sun/sky. (A nocturnal magic glow
  // used to be baked in here, which read as a persistent cold blue cast.)

  if (weights[BiomeType.EmberWastes] > 0.01 && t < 0.35) {
    const str = (1.0 - t / 0.35) * 0.25 * weights[BiomeType.EmberWastes];
    _emissiveResult.r += 1.0 * str;
    _emissiveResult.g += 0.3 * str;
    _emissiveResult.b += 0.05 * str;
  }

  if (weights[BiomeType.CrystalTundra] > 0.01 && t > 0.5) {
    const str = ((t - 0.5) / 0.5) * 0.12 * weights[BiomeType.CrystalTundra];
    _emissiveResult.r += 0.3 * str;
    _emissiveResult.g += 0.5 * str;
    _emissiveResult.b += 1.0 * str;
  }

  if (weights[BiomeType.TwilightMarsh] > 0.01 && t < 0.4) {
    const str = (1.0 - t / 0.4) * 0.1 * weights[BiomeType.TwilightMarsh];
    _emissiveResult.r += 0.2 * str;
    _emissiveResult.g += 0.5 * str;
    _emissiveResult.b += 0.3 * str;
  }

  if (weights[BiomeType.SunlitMeadows] > 0.01 && t < 0.3) {
    const str = (1.0 - t / 0.3) * 0.08 * weights[BiomeType.SunlitMeadows];
    _emissiveResult.r += 0.8 * str;
    _emissiveResult.g += 0.6 * str;
    _emissiveResult.b += 0.1 * str;
  }

  if (weights[BiomeType.Desert] > 0.01 && t > 0.55) {
    const str = ((t - 0.55) / 0.45) * 0.08 * weights[BiomeType.Desert];
    _emissiveResult.r += 0.45 * str;
    _emissiveResult.g += 0.3 * str;
    _emissiveResult.b += 0.08 * str;
  }

  return _emissiveResult;
}
