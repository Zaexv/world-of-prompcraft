import * as THREE from 'three';
import { Water as ThreeWater } from 'three/examples/jsm/objects/Water.js';

/**
 * Reflective water plane using Three.js Water (planar reflections).
 * Teldrassil-inspired: teal tint, gentle waves, real scene reflections.
 */
export class Water {
  public mesh: THREE.Mesh;
  private water: ThreeWater;

  /** Water surface Y level */
  public static readonly LEVEL = -1.0;

  /** Convenience accessor for collision code. */
  static getWaterLevel(): number {
    return Water.LEVEL;
  }

  constructor(scene: THREE.Scene) {
    // Large water plane — repositioned each frame to follow the player
    const geometry = new THREE.PlaneGeometry(2048, 2048, 1, 1);

    // Generate a simple normal map procedurally
    const normalCanvas = this.generateNormalMap(512);
    const normalTexture = new THREE.CanvasTexture(normalCanvas);
    normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;

    this.water = new ThreeWater(geometry, {
      textureWidth: 256,
      textureHeight: 256,
      waterNormals: normalTexture,
      sunDirection: new THREE.Vector3(0.3, 1.0, 0.5).normalize(),
      sunColor: 0x8899bb,
      waterColor: 0x0a3a3a,
      distortionScale: 2.5,
      fog: true,
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
  }

  /** Call every frame. Pass player position to keep water centered. */
  update(delta: number, playerX?: number, playerZ?: number): void {
    const mat = this.water.material as THREE.ShaderMaterial;
    if (mat.uniforms['time']) {
      mat.uniforms['time'].value += delta * 0.5;
    }

    // Follow player so water extends to the horizon in every direction
    if (playerX !== undefined && playerZ !== undefined) {
      this.water.position.x = playerX;
      this.water.position.z = playerZ;
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
