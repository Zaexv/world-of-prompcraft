import * as THREE from 'three';

/**
 * Teldrassil moonlit atmosphere: silver-blue directional moonlight,
 * hemisphere fill with purple undertones, purple ambient point light, and
 * deep purple-blue exponential fog.
 */
export class Lighting {
  public sun: THREE.DirectionalLight;
  public hemisphere: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    // --- Directional "moon" light (brighter silver-blue) ---
    this.sun = new THREE.DirectionalLight(0xaabbdd, 1.4);
    this.sun.position.set(80, 140, 50);
    this.sun.castShadow = true;

    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.camera.left = -150;
    this.sun.shadow.camera.right = 150;
    this.sun.shadow.camera.top = 150;
    this.sun.shadow.camera.bottom = -150;
    this.sun.shadow.bias = -0.001;

    scene.add(this.sun);
    scene.add(this.sun.target);

    // --- Hemisphere light ---
    // Silver-blue sky from above, dark purple ground from below
    // Brighter hemisphere: more blue sky fill + warmer purple ground bounce
    this.hemisphere = new THREE.HemisphereLight(0x8899cc, 0x332244, 0.9);
    scene.add(this.hemisphere);

    // --- Ambient purple point light (distant, for subtle purple glow) ---
    const purpleAmbient = new THREE.PointLight(0x7744bb, 0.8, 600, 1.5);
    purpleAmbient.position.set(-80, 60, -100);
    scene.add(purpleAmbient);

    // --- Moonbeam spotlights (simulating light breaking through canopy) ---
    const moonbeamColor = 0x8899cc;
    const moonbeamConfigs = [
      { x: 20, z: -15 },
      { x: -35, z: 25 },
      { x: 50, z: 40 },
    ];

    for (const cfg of moonbeamConfigs) {
      const beam = new THREE.SpotLight(moonbeamColor, 0.8, 250, Math.PI / 8, 0.6, 1.2);
      beam.position.set(cfg.x, 80, cfg.z);
      beam.target.position.set(cfg.x, 0, cfg.z);
      beam.castShadow = false; // Spotlights without shadows for performance
      scene.add(beam);
      scene.add(beam.target);
    }

    // --- Fog (exponential) ---
    // Deep purple-blue for mysterious Teldrassil depth
    // Lighter fog — still purple but much less dense so colors come through
    scene.fog = new THREE.FogExp2(0x1a1133, 0.004);
  }
}
