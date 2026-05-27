import * as THREE from 'three';

/**
 * Daytime lighting:
 * - bright warm key light (sun)
 * - bright hemisphere fill
 * - daylight fog
 */
export class Lighting {
  public sun: THREE.DirectionalLight;
  public hemisphere: THREE.HemisphereLight;
  public ambient: THREE.AmbientLight;
  public rim: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    // --- Key sun light (casts shadows) ---
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    this.sun.position.set(200, 120, -200);
    this.sun.castShadow = true;

    this.sun.shadow.mapSize.set(1024, 1024); // Increased shadow quality for daytime
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 800;
    this.sun.shadow.camera.left = -120;
    this.sun.shadow.camera.right = 120;
    this.sun.shadow.camera.top = 120;
    this.sun.shadow.camera.bottom = -120;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.target.position.set(0, 0, 0);

    scene.add(this.sun);
    scene.add(this.sun.target);

    // --- Broad sky/ground fill ---
    this.hemisphere = new THREE.HemisphereLight(0x3ea3ff, 0x444d33, 0.8);
    scene.add(this.hemisphere);

    // --- Base ambient for dark areas ---
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(this.ambient);

    // --- Rim/fill directional (no shadows, cheap readability boost) ---
    this.rim = new THREE.DirectionalLight(0xffeedd, 0.3);
    this.rim.position.set(-70, 42, -80);
    this.rim.castShadow = false;
    scene.add(this.rim);

    // --- Fog (exponential) - matched to daytime sky color ---
    scene.fog = new THREE.FogExp2(0x3ea3ff, 0.002);
  }
}
