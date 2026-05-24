import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Thin wrapper around Three.js loaders for future asset loading.
 * Currently no external assets are used; everything is procedural.
 */
export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private readonly maxConcurrentLoads: number;
  private activeLoads = 0;
  private readonly pendingLoads: Array<() => void> = [];

  constructor(maxConcurrentLoads = 3) {
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.maxConcurrentLoads = Math.max(1, maxConcurrentLoads);
  }

  /** Load a GLTF/GLB model and return the parsed result. */
  loadGLTF(path: string): Promise<GLTF> {
    return this.enqueueLoad(() => new Promise((resolve, reject) => {
      this.gltfLoader.load(path, resolve, undefined, reject);
    }));
  }

  /** Load a texture image and return the Three.js Texture. */
  loadTexture(path: string): Promise<THREE.Texture> {
    return this.enqueueLoad(() => new Promise((resolve, reject) => {
      this.textureLoader.load(path, resolve, undefined, reject);
    }));
  }

  private enqueueLoad<T>(load: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = (): void => {
        this.activeLoads++;
        void load()
          .then(resolve, reject)
          .finally(() => {
            this.activeLoads--;
            this.drainQueue();
          });
      };

      this.pendingLoads.push(run);
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    while (this.activeLoads < this.maxConcurrentLoads && this.pendingLoads.length > 0) {
      const next = this.pendingLoads.shift();
      if (next) next();
    }
  }
}
