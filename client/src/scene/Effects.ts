import * as THREE from 'three';

/**
 * Handles volumetric atmosphere/fog.
 */
export class Effects {
  private scene: THREE.Scene;
  private fog: THREE.FogExp2;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Performant fog setup (Exponential Squared)
    this.fog = new THREE.FogExp2(0x88d0ff, 0.001);
    this.scene.fog = this.fog;
  }

  setFog(color: number, density: number): void {
    this.fog.color.set(color);
    this.fog.density = density;
  }

  /** Update the player position so effects stay near the camera. */
  setPlayerPosition(_x: number, _z: number): void {
  }

  update(_delta: number): void {
  }
}
