import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Thin wrapper around Three.js loaders for future asset loading.
 * Currently no external assets are used; everything is procedural.
 */
export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;

  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  /** Load a GLTF/GLB model and return the parsed result. */
  loadGLTF(path: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(path, resolve, undefined, reject);
    });
  }

  /** Load a texture image and return the Three.js Texture. */
  loadTexture(path: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(path, resolve, undefined, reject);
    });
  }
}
