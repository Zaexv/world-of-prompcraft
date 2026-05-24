import * as THREE from 'three';

/**
 * Moonlit night lighting tuned for an image-based skybox:
 * - one shadowed key light (moon)
 * - broad hemisphere fill + subtle ambient
 * - soft non-shadowed rim directional for silhouette readability
 */
export class Lighting {
  public sun: THREE.DirectionalLight;
  public hemisphere: THREE.HemisphereLight;
  public ambient: THREE.AmbientLight;
  public rim: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    // --- Key moon light (casts shadows) ---
    this.sun = new THREE.DirectionalLight(0x9fb9ff, 0.78);
    this.sun.position.set(95, 130, 45);
    this.sun.castShadow = true;

    this.sun.shadow.mapSize.set(512, 512);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.camera.left = -76;
    this.sun.shadow.camera.right = 76;
    this.sun.shadow.camera.top = 76;
    this.sun.shadow.camera.bottom = -76;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.target.position.set(0, 0, 0);

    scene.add(this.sun);
    scene.add(this.sun.target);

    // --- Broad sky/ground fill ---
    this.hemisphere = new THREE.HemisphereLight(0x5f78a8, 0x111827, 0.50);
    scene.add(this.hemisphere);

    // --- Low-cost base ambient for dark areas ---
    this.ambient = new THREE.AmbientLight(0x111522, 0.12);
    scene.add(this.ambient);

    // --- Rim/fill directional (no shadows, cheap readability boost) ---
    this.rim = new THREE.DirectionalLight(0x7b88c5, 0.18);
    this.rim.position.set(-70, 42, -80);
    this.rim.castShadow = false;
    scene.add(this.rim);

    // --- Fog (exponential) ---
    scene.fog = new THREE.FogExp2(0x0b1222, 0.0038);
  }
}
