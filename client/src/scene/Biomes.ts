import * as THREE from 'three';

/**
 * Biome system for World of Promptcraft.
 *
 * Five ecosystems blend smoothly based on world position:
 *   - Teldrassil Forest (center)  — mystical purple/teal night forest
 *   - Ember Wastes (east)         — volcanic reds/oranges with lava glow
 *   - Crystal Tundra (north)      — icy whites/blues, frozen shimmer
 *   - Twilight Marsh (south)      — flat swampy deep greens/murky purples
 *   - Sunlit Meadows (west)       — warm golden-green rolling hills
 */

export enum BiomeType {
  Teldrassil = 0,
  EmberWastes = 1,
  CrystalTundra = 2,
  TwilightMarsh = 3,
  SunlitMeadows = 4,
}

export interface BiomeWeights {
  [BiomeType.Teldrassil]: number;
  [BiomeType.EmberWastes]: number;
  [BiomeType.CrystalTundra]: number;
  [BiomeType.TwilightMarsh]: number;
  [BiomeType.SunlitMeadows]: number;
}

// Transition zone width — how many units the biomes blend over
const TRANSITION = 100;
// Distance from origin at which non-center biomes begin to dominate
const BIOME_START = 120;

/**
 * Returns a weight [0..1] for each biome at a given world (x, z).
 * Weights always sum to 1.
 */
export function getBiomeWeights(x: number, z: number): BiomeWeights {
  const weights: BiomeWeights = {
    [BiomeType.Teldrassil]: 0,
    [BiomeType.EmberWastes]: 0,
    [BiomeType.CrystalTundra]: 0,
    [BiomeType.TwilightMarsh]: 0,
    [BiomeType.SunlitMeadows]: 0,
  };

  // Distance from origin — center biome fades out as you move away
  const dist = Math.sqrt(x * x + z * z);
  const centerWeight = THREE.MathUtils.clamp(1.0 - (dist - BIOME_START + TRANSITION) / TRANSITION, 0, 1);

  // Directional biome strengths based on angle
  // East: Ember, North: Tundra, South: Marsh, West: Meadows
  const angle = Math.atan2(z, x); // -PI..PI; 0=east, PI/2=north, -PI/2=south, PI=west

  // Each biome occupies a roughly 90-degree sector
  const ember = directionalWeight(angle, 0);              // east
  const tundra = directionalWeight(angle, Math.PI / 2);   // north
  const meadows = directionalWeight(angle, Math.PI);      // west (also handle -PI)
  const meadowsNeg = directionalWeight(angle, -Math.PI);
  const marsh = directionalWeight(angle, -Math.PI / 2);   // south

  const outerWeight = THREE.MathUtils.clamp((dist - BIOME_START) / TRANSITION, 0, 1);

  weights[BiomeType.Teldrassil] = centerWeight;
  weights[BiomeType.EmberWastes] = ember * outerWeight;
  weights[BiomeType.CrystalTundra] = tundra * outerWeight;
  weights[BiomeType.TwilightMarsh] = marsh * outerWeight;
  weights[BiomeType.SunlitMeadows] = Math.max(meadows, meadowsNeg) * outerWeight;

  // Normalize so weights sum to 1
  const total =
    weights[BiomeType.Teldrassil] +
    weights[BiomeType.EmberWastes] +
    weights[BiomeType.CrystalTundra] +
    weights[BiomeType.TwilightMarsh] +
    weights[BiomeType.SunlitMeadows];

  if (total > 0) {
    weights[BiomeType.Teldrassil] /= total;
    weights[BiomeType.EmberWastes] /= total;
    weights[BiomeType.CrystalTundra] /= total;
    weights[BiomeType.TwilightMarsh] /= total;
    weights[BiomeType.SunlitMeadows] /= total;
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
  switch (biome) {
    case BiomeType.Teldrassil:
      return 0; // base terrain unchanged
    case BiomeType.EmberWastes:
      // Steeper, jagged volcanic terrain
      return (
        Math.sin(x * 0.02 + 5.0) * Math.cos(z * 0.025 - 2.0) * 6 +
        Math.abs(Math.sin(x * 0.06) * Math.cos(z * 0.07)) * 4 +
        Math.sin(x * 0.12 + z * 0.08) * 2
      );
    case BiomeType.CrystalTundra:
      // High peaks and plateaus
      return (
        Math.abs(Math.sin(x * 0.008 + 1.0) * Math.cos(z * 0.01 - 0.5)) * 12 +
        Math.sin(x * 0.03 + z * 0.02) * 3
      );
    case BiomeType.TwilightMarsh:
      // Very flat, low terrain with slight undulation
      return (
        -Math.abs(Math.sin(x * 0.01) * Math.cos(z * 0.012)) * 5 +
        Math.sin(x * 0.04 + z * 0.05) * 0.5 - 2
      );
    case BiomeType.SunlitMeadows:
      // Gentle rolling hills
      return (
        Math.sin(x * 0.015 + 3.0) * Math.cos(z * 0.018 + 1.0) * 3 +
        Math.sin(x * 0.04 - 1.0) * Math.cos(z * 0.035 + 2.0) * 1.5
      );
  }
}

// ── Biome color palettes ────────────────────────────────────────────────────

interface BiomeColors {
  low: THREE.Color;
  mid: THREE.Color;
  high: THREE.Color;
  peak: THREE.Color;
}

const BIOME_PALETTES: Record<BiomeType, BiomeColors> = {
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
};

/**
 * Returns a blended terrain color for a position and height, considering biome weights.
 */
// Reusable Color objects to avoid per-vertex allocations during chunk loading
const _colorResult = new THREE.Color();
const _colorTemp = new THREE.Color();

const _biomeKeys = [
  BiomeType.Teldrassil,
  BiomeType.EmberWastes,
  BiomeType.CrystalTundra,
  BiomeType.TwilightMarsh,
  BiomeType.SunlitMeadows,
] as const;

/**
 * Returns a blended terrain color for a position and height, considering biome weights.
 * NOTE: Returns a shared Color object — copy it if you need to store the value.
 */
// Beach sand palette (Málaga golden sand)
const _sandDry = new THREE.Color(0xd4b896);   // dry sand (upper beach)
const _sandWet = new THREE.Color(0x9a8060);    // wet sand (water's edge)
const _sandMid = new THREE.Color(0xc4a878);    // mid-beach

/** Beach blend imported lazily to avoid circular deps. */
let _getBeachBlend: ((x: number, z: number) => number) | null = null;

/** Register the Terrain.getBeachBlend function (called once by Terrain). */
export function registerBeachBlend(fn: (x: number, z: number) => number): void {
  _getBeachBlend = fn;
}

export function getBiomeColor(x: number, z: number, y: number, t: number): THREE.Color {
  const weights = getBiomeWeights(x, z);
  _colorResult.setRGB(0, 0, 0);

  for (const biome of _biomeKeys) {
    const w = weights[biome];
    if (w < 0.001) continue;

    const p = BIOME_PALETTES[biome];
    if (t < 0.3) {
      _colorTemp.copy(p.low).lerp(p.mid, t / 0.3);
    } else if (t < 0.55) {
      _colorTemp.copy(p.mid).lerp(p.high, (t - 0.3) / 0.25);
    } else if (t < 0.75) {
      _colorTemp.copy(p.high).lerp(p.peak, (t - 0.55) / 0.2);
    } else {
      _colorTemp.copy(p.peak);
    }

    _colorResult.r += _colorTemp.r * w;
    _colorResult.g += _colorTemp.g * w;
    _colorResult.b += _colorTemp.b * w;
  }

  // Beach sand override for Fort Malaka
  const beachBlend = _getBeachBlend ? _getBeachBlend(x, z) : 0;
  if (beachBlend > 0.001) {
    const beachProgress = Math.max(0, Math.min(1, (-z - 155) / 35));
    // Dry sand → mid sand → wet sand as we approach water
    if (beachProgress < 0.5) {
      _colorTemp.copy(_sandDry).lerp(_sandMid, beachProgress / 0.5);
    } else {
      _colorTemp.copy(_sandMid).lerp(_sandWet, (beachProgress - 0.5) / 0.5);
    }
    // Add subtle noise variation to sand color
    const noise = Math.sin(x * 0.8 + z * 0.6) * 0.03;
    _colorTemp.r += noise;
    _colorTemp.g += noise * 0.8;

    _colorResult.lerp(_colorTemp, beachBlend);
  }

  return _colorResult;
}

// ── Biome emissive glow ─────────────────────────────────────────────────────

/**
 * Returns per-vertex emissive color for biome-specific ground glow.
 */
// Pre-allocated emissive colors for Teldrassil glow lerp
const _teldEmA = new THREE.Color(0x4422aa);
const _teldEmB = new THREE.Color(0x225566);
const _emissiveResult = new THREE.Color();
const _emissiveTemp = new THREE.Color();

/**
 * Returns per-vertex emissive color for biome-specific ground glow.
 * NOTE: Returns a shared Color object — copy it if you need to store the value.
 */
export function getBiomeEmissive(x: number, z: number, y: number, t: number): THREE.Color {
  const weights = getBiomeWeights(x, z);
  _emissiveResult.setRGB(0, 0, 0);

  // Beach area: warm subtle glow near water, no forest glow
  const beachBlend = _getBeachBlend ? _getBeachBlend(x, z) : 0;
  if (beachBlend > 0.5) {
    const beachProgress = Math.max(0, Math.min(1, (-z - 155) / 35));
    if (beachProgress > 0.7) {
      // Subtle warm water-edge glow
      const str = (beachProgress - 0.7) / 0.3 * 0.06 * beachBlend;
      _emissiveResult.r += 0.3 * str;
      _emissiveResult.g += 0.5 * str;
      _emissiveResult.b += 0.7 * str;
    }
    return _emissiveResult;
  }

  // Teldrassil: purple/teal glow in valleys
  if (weights[BiomeType.Teldrassil] > 0.01 && t < 0.25) {
    const str = (1.0 - t / 0.25) * 0.15 * weights[BiomeType.Teldrassil];
    _emissiveTemp.copy(_teldEmA).lerp(_teldEmB, t / 0.25);
    _emissiveResult.r += _emissiveTemp.r * str;
    _emissiveResult.g += _emissiveTemp.g * str;
    _emissiveResult.b += _emissiveTemp.b * str;
  }

  // Ember Wastes: orange/red lava glow in low areas
  if (weights[BiomeType.EmberWastes] > 0.01 && t < 0.35) {
    const str = (1.0 - t / 0.35) * 0.25 * weights[BiomeType.EmberWastes];
    _emissiveResult.r += 1.0 * str;
    _emissiveResult.g += 0.3 * str;
    _emissiveResult.b += 0.05 * str;
  }

  // Crystal Tundra: icy blue shimmer on peaks
  if (weights[BiomeType.CrystalTundra] > 0.01 && t > 0.5) {
    const str = ((t - 0.5) / 0.5) * 0.12 * weights[BiomeType.CrystalTundra];
    _emissiveResult.r += 0.3 * str;
    _emissiveResult.g += 0.5 * str;
    _emissiveResult.b += 1.0 * str;
  }

  // Twilight Marsh: murky green-purple glow everywhere (low terrain)
  if (weights[BiomeType.TwilightMarsh] > 0.01 && t < 0.4) {
    const str = (1.0 - t / 0.4) * 0.1 * weights[BiomeType.TwilightMarsh];
    _emissiveResult.r += 0.2 * str;
    _emissiveResult.g += 0.5 * str;
    _emissiveResult.b += 0.3 * str;
  }

  // Sunlit Meadows: warm golden glow in valleys
  if (weights[BiomeType.SunlitMeadows] > 0.01 && t < 0.3) {
    const str = (1.0 - t / 0.3) * 0.08 * weights[BiomeType.SunlitMeadows];
    _emissiveResult.r += 0.8 * str;
    _emissiveResult.g += 0.6 * str;
    _emissiveResult.b += 0.1 * str;
  }

  return _emissiveResult;
}
