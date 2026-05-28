import * as THREE from 'three';
import { Water as ThreeWater } from 'three/examples/jsm/objects/Water.js';
import { SUN_DIR } from './Lighting';

// ── Shore foam overlay shader ───────────────────────────────────────────────

const FOAM_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FOAM_FRAG = /* glsl */`
uniform float time;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),               hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  // Scroll in the wave-approach direction at two frequencies for organic streaks
  vec2 uv1 = vUv * 12.0 + vec2(time * 0.14,  time * 0.06);
  vec2 uv2 = vUv *  6.0 + vec2(time * 0.09, -time * 0.04);
  float foam = smoothstep(0.50, 0.72, vnoise(uv1) * vnoise(uv2) * 1.6);

  // Pulse opacity with the wave cycle so foam is brightest when water peaks
  float pulse = clamp(sin(time * 0.38) * 0.65 + 0.55, 0.0, 1.0);

  gl_FragColor = vec4(0.92, 0.97, 1.0, foam * pulse * 0.20);
}
`;

// ── Water class ─────────────────────────────────────────────────────────────

/**
 * Reflective water plane using Three.js Water (planar reflections) with an
 * animated shore wave.
 *
 * The visual mesh (this.water) oscillates around Water.LEVEL so the beach
 * appears to breathe.  Water.LEVEL itself stays constant so physics / NPC
 * wander code is unaffected.
 */
export class Water {
  public mesh: THREE.Mesh;
  private water: ThreeWater;
  private foam: THREE.Mesh;
  private foamMat: THREE.ShaderMaterial;
  private waveTime = 0;

  /** Water surface Y level — physics / collision reference, never changes. */
  public static readonly LEVEL = -1.0;

  /** Convenience accessor for collision code. */
  static getWaterLevel(): number {
    return Water.LEVEL;
  }

  // Wave parameters: two-component oscillation for organic feel.
  // Combined amplitude ≈ ±0.35 — enough to lap over gently sloped beaches.
  private static readonly AMP_A  = 0.26;   // main tide
  private static readonly AMP_B  = 0.09;   // secondary ripple
  private static readonly FREQ_A = 0.38;   // rad/s  (~16 s period)
  private static readonly FREQ_B = 1.25;   // rad/s  (~5 s period)
  private static readonly PHASE_B = 1.05;  // phase offset between the two

  constructor(scene: THREE.Scene) {
    // Large water plane — repositioned each frame to follow the player
    const geometry = new THREE.PlaneGeometry(2048, 2048, 1, 1);
    const reflectionResolution = window.devicePixelRatio > 1 ? 384 : 512;

    // Generate a simple normal map procedurally
    const normalCanvas = this.generateNormalMap(512);
    const normalTexture = new THREE.CanvasTexture(normalCanvas);
    normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;

    this.water = new ThreeWater(geometry, {
      textureWidth: reflectionResolution,
      textureHeight: reflectionResolution,
      waterNormals: normalTexture,
      sunDirection: SUN_DIR,
      sunColor: 0xffffcc,
      waterColor: 0x0d4a5a,
      distortionScale: 2.5,
      fog: true,
      clipBias: 0.003,
    });

    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = Water.LEVEL;

    // Prevent z-fighting with shoreline terrain
    const mat = this.water.material as THREE.ShaderMaterial;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 1;
    mat.polygonOffsetUnits = 1;

    this.mesh = this.water;
    scene.add(this.water);

    // Shore foam overlay — lives just above the water surface and pulses with
    // the wave cycle to show organic whitecap / wash streaks.
    this.foamMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: FOAM_VERT,
      fragmentShader: FOAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.foam = new THREE.Mesh(
      new THREE.PlaneGeometry(2048, 2048, 1, 1),
      this.foamMat,
    );
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.y = Water.LEVEL + 0.02;
    scene.add(this.foam);
  }

  /** Call every frame. Pass player position to keep water centred. */
  update(delta: number, playerX?: number, playerZ?: number): void {
    this.waveTime += delta;

    const mat = this.water.material as THREE.ShaderMaterial;
    if (mat.uniforms['time']) {
      mat.uniforms['time'].value += delta * 0.5;
    }

    this.foamMat.uniforms['time'].value = this.waveTime;

    // Two-component shore wave: slow tide + faster ripple
    const waveY =
      Water.AMP_A * Math.sin(this.waveTime * Water.FREQ_A) +
      Water.AMP_B * Math.sin(this.waveTime * Water.FREQ_B + Water.PHASE_B);

    this.water.position.y = Water.LEVEL + waveY;
    this.foam.position.y  = Water.LEVEL + waveY + 0.02;

    // Follow player so water extends to the horizon in every direction
    if (playerX !== undefined && playerZ !== undefined) {
      this.water.position.x = playerX;
      this.water.position.z = playerZ;
      this.foam.position.x  = playerX;
      this.foam.position.z  = playerZ;
    }
  }

  /**
   * Generate a simple procedural normal map on canvas.
   * This replaces the need for an external waternormals.jpg texture.
   */
  private generateNormalMap(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Generate ripple-like normal map using overlapping sine waves
        const scale1 = 0.05;
        const scale2 = 0.12;
        const scale3 = 0.03;

        const nx = Math.sin(x * scale1) * Math.cos(y * scale2) * 0.3
                 + Math.sin(x * scale2 + y * scale1) * 0.2
                 + Math.cos(x * scale3 - y * scale3) * 0.1;
        const ny = Math.cos(x * scale2) * Math.sin(y * scale1) * 0.3
                 + Math.cos(x * scale1 - y * scale2) * 0.2
                 + Math.sin(x * scale3 + y * scale3) * 0.1;

        // Normal map encoding: (nx*0.5+0.5)*255, (ny*0.5+0.5)*255, z≈1
        data[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = 220; // Strong Z component (mostly pointing up)
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}
