import * as THREE from 'three';

/**
 * Loads a user-provided skybox texture (equirectangular) and applies it as
 * the scene background/environment for reflections.
 */
export class Skybox {
  constructor(scene: THREE.Scene) {
    const loader = new THREE.TextureLoader();
    loader.load(
      '/skybox.png',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
      },
      undefined,
      () => {
        scene.background = new THREE.Color(0x0a0612);
      },
    );
  }
}
