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

export const ZONE_ATMOSPHERES: Record<string, AtmospherePreset> = {
  //                           fog        density  sky        ground     ambient    aInt  sun        bloom
  "Blasted Suarezlands":  preset(0x1a0830, 0.0060, 0x4a1880, 0x3a1a60, 0x2a1050, 0.25, 0xcc88ff, 0.80),
  "Fort Malaka":           preset(0x0f1828, 0.0028, 0x3a4878, 0x2a3040, 0x1a2038, 0.18, 0xaac0ff, 0.90),
  "Elders' Village":       preset(0x0b1222, 0.0038, 0x5f78a8, 0x324050, 0x1a2235, 0.18, 0x9fb9ff, 0.90),
  "Dark Forest":           preset(0x030a03, 0.0065, 0x112211, 0x1a251a, 0x122012, 0.14, 0x44aa44, 0.75),
  "Ember Peaks":           preset(0x1a0600, 0.0050, 0x5a2010, 0x4a2510, 0x30150a, 0.22, 0xff8844, 0.82),
  "Crystal Lake":          preset(0x071520, 0.0030, 0x3a6090, 0x2a3a50, 0x1a2840, 0.20, 0x88ccff, 0.88),
  "Ember Wastes":          preset(0x1a0800, 0.0080, 0x5a1800, 0x4a1a05, 0x351008, 0.28, 0xff4400, 0.70),
  "Crystal Tundra":        preset(0x1a2a3a, 0.0040, 0x7090b0, 0x506580, 0x2a3a55, 0.25, 0xc0e0ff, 0.88),
  "Twilight Marsh":        preset(0x030a03, 0.0080, 0x0a1a0a, 0x1a251a, 0x102010, 0.14, 0x66aa44, 0.72),
  "Sunlit Meadows":        preset(0x16160a, 0.0022, 0x7a8040, 0x5a5a25, 0x252512, 0.28, 0xffe870, 0.92),
  "Teldrassil Wilds":      preset(0x0b1222, 0.0040, 0x4a5890, 0x2a354a, 0x1a2235, 0.18, 0x9fb9ff, 0.88),
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
    // Hemisphere sky/ground
    this.hemisphere.color.copy(c.skyColor);
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
