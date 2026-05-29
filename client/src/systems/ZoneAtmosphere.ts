import * as THREE from 'three';

/**
 * ZoneAtmosphere — per-zone fog + lighting presets that smooth-transition
 * whenever the player crosses a zone boundary.
 *
 * Controlled by calling `enterZone(zoneName)` and `update(deltaSeconds)`.
 * Interpolation takes ~3 s so the shift feels cinematic, not jarring.
 */

interface AtmospherePreset {
  /** Exponential fog density */
  fogDensity: number;
  /** Fog and scene background color */
  fogColor: THREE.Color;
  /** Hemisphere sky tint (upper sky color) */
  skyColor: THREE.Color;
  /** Hemisphere ground tint */
  groundColor: THREE.Color;
  /** AmbientLight color */
  ambientColor: THREE.Color;
  /** Ambient light intensity multiplier */
  ambientIntensity: number;
  /** Moon/directional light color */
  sunColor: THREE.Color;
  /** Bloom threshold (bright = less bloom; dark = more) */
  bloomThreshold: number;
}

// ── Presets keyed by zone name ──────────────────────────────────────────────

function preset(
  fogHex: number,
  fogDensity: number,
  skyHex: number,
  groundHex: number,
  ambientHex: number,
  ambientIntensity: number,
  sunHex: number,
  bloomThreshold: number,
): AtmospherePreset {
  return {
    fogDensity,
    fogColor: new THREE.Color(fogHex),
    skyColor: new THREE.Color(skyHex),
    groundColor: new THREE.Color(groundHex),
    ambientColor: new THREE.Color(ambientHex),
    ambientIntensity,
    sunColor: new THREE.Color(sunHex),
    bloomThreshold,
  };
}

// Warm, bright daytime presets. Each zone keeps a gentle identity (ember = warm
// haze, tundra = bright cool snow, marsh = hazy green) but all read as sunny day:
// lifted ambient (~0.5–0.68), warm sun, light non-navy skies, thin fog.
// NOTE: `skyColor` doubles as the sky background AND the hemisphere fill source;
// `_applyLive` warms the fill so a blue sky never casts a cold tint on the ground.
export const ZONE_ATMOSPHERES: Record<string, AtmospherePreset> = {
  //                           fog        density  sky        ground     ambient    aInt  sun        bloom
  "Blasted Suarezlands":  preset(0xc8c4e0, 0.0028, 0xb9c0e8, 0x6a5a50, 0xfff0e0, 0.55, 0xffe8c8, 0.88),
  "Fort Malaka":           preset(0xc6dcec, 0.0020, 0xa8cdec, 0x6a5e48, 0xfff0d8, 0.60, 0xffe6b8, 0.90),
  "Elders' Village":       preset(0xc8def0, 0.0018, 0xa6cdee, 0x6e5e44, 0xfff2dc, 0.62, 0xffe7bc, 0.90),
  "Dark Forest":           preset(0xa8c0b0, 0.0035, 0x8fb4cf, 0x4a5238, 0xeaf0d8, 0.50, 0xfff0c8, 0.85),
  "Ember Peaks":           preset(0xe8c4a0, 0.0030, 0xe0b890, 0x6a4a30, 0xfff0dc, 0.55, 0xffd9a0, 0.85),
  "Crystal Lake":          preset(0xc8e2f2, 0.0018, 0xa8d4f0, 0x6a6450, 0xfff2e0, 0.60, 0xffe8c4, 0.90),
  "Ember Wastes":          preset(0xeac49a, 0.0035, 0xe8b888, 0x7a5230, 0xfff0d8, 0.60, 0xffce92, 0.82),
  "Crystal Tundra":        preset(0xd6e6f2, 0.0022, 0xc0dcf0, 0x8a8a88, 0xfff0e6, 0.62, 0xfff0d8, 0.92),
  "Twilight Marsh":        preset(0xb0c8b8, 0.0040, 0x9cc0c0, 0x4a5840, 0xeaf0d8, 0.50, 0xfff0c0, 0.80),
  "Sunlit Meadows":        preset(0xd0e6e0, 0.0015, 0xb8dcf0, 0x7a7045, 0xfff6e0, 0.68, 0xffeec0, 0.95),
  "Teldrassil Wilds":      preset(0xc4def0, 0.0022, 0xa6cee8, 0x5e5e40, 0xfff0dc, 0.60, 0xffe8bc, 0.90),
};

const DEFAULT_PRESET = ZONE_ATMOSPHERES["Elders' Village"]!;

// ── Runtime state ────────────────────────────────────────────────────────────

/** Current live values (lerped each frame) */
interface LiveState {
  fogDensity: number;
  fogColor: THREE.Color;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  sunColor: THREE.Color;
  bloomThreshold: number;
}

function liveFromPreset(p: AtmospherePreset): LiveState {
  return {
    fogDensity: p.fogDensity,
    fogColor: p.fogColor.clone(),
    skyColor: p.skyColor.clone(),
    groundColor: p.groundColor.clone(),
    ambientColor: p.ambientColor.clone(),
    ambientIntensity: p.ambientIntensity,
    sunColor: p.sunColor.clone(),
    bloomThreshold: p.bloomThreshold,
  };
}

export class ZoneAtmosphere {
  private scene: THREE.Scene;
  private sun: THREE.DirectionalLight;
  private hemisphere: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private bloomPassRef: { threshold: number } | null = null;

  private current: LiveState;
  private target: AtmospherePreset;
  private transitionSpeed = 1 / 3; // 1/seconds → full transition in ~3 s

  // Warm fill applied to the hemisphere SKY tint so a blue sky background does
  // not translate into a cold blue light on the (upward-facing) ground.
  private static readonly WARM_FILL = new THREE.Color(0xfff1da);
  private readonly _hemiSky = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    sun: THREE.DirectionalLight,
    hemisphere: THREE.HemisphereLight,
    ambient: THREE.AmbientLight,
  ) {
    this.scene = scene;
    this.sun = sun;
    this.hemisphere = hemisphere;
    this.ambient = ambient;
    this.target = DEFAULT_PRESET;
    this.current = liveFromPreset(DEFAULT_PRESET);
    this._applyLive();
  }

  /** Optional: supply bloom pass so density transitions update bloom threshold. */
  setBloomPass(pass: { threshold: number }): void {
    this.bloomPassRef = pass;
  }

  /** Call when the player enters a new zone. */
  enterZone(zoneName: string): void {
    this.target = ZONE_ATMOSPHERES[zoneName] ?? DEFAULT_PRESET;
  }

  /**
   * Call every frame.  Smoothly interpolates current live values toward the
   * target preset and pushes the results into scene fog and lights.
   */
  update(delta: number): void {
    const t = Math.min(1, delta * this.transitionSpeed * 60);
    this._lerp(t);
    this._applyLive();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _lerp(t: number): void {
    const c = this.current;
    const tgt = this.target;
    c.fogDensity += (tgt.fogDensity - c.fogDensity) * t;
    c.fogColor.lerp(tgt.fogColor, t);
    c.skyColor.lerp(tgt.skyColor, t);
    c.groundColor.lerp(tgt.groundColor, t);
    c.ambientColor.lerp(tgt.ambientColor, t);
    c.ambientIntensity += (tgt.ambientIntensity - c.ambientIntensity) * t;
    c.sunColor.lerp(tgt.sunColor, t);
    c.bloomThreshold += (tgt.bloomThreshold - c.bloomThreshold) * t;
  }

  private _applyLive(): void {
    const c = this.current;
    // Fog
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(c.fogColor);
      this.scene.fog.density = c.fogDensity;
    }
    // Background (Match skyColor, not fogColor, for a clearer sky)
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(c.skyColor);
    }
    // Hemisphere sky/ground. The sky background stays the true (often blue)
    // skyColor, but the hemisphere FILL leans warm so the ground reads sunlit,
    // not cold. Half sky + half warm cream keeps daylight without a blue cast.
    this._hemiSky.copy(c.skyColor).lerp(ZoneAtmosphere.WARM_FILL, 0.5);
    this.hemisphere.color.copy(this._hemiSky);
    this.hemisphere.groundColor.copy(c.groundColor);
    // Ambient
    this.ambient.color.copy(c.ambientColor);
    this.ambient.intensity = c.ambientIntensity;
    // Sun (moon directional)
    this.sun.color.copy(c.sunColor);
    // Bloom
    if (this.bloomPassRef) {
      this.bloomPassRef.threshold = c.bloomThreshold;
    }
  }
}
