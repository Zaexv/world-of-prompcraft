import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { AssetLoader } from '../utils/asset/AssetLoader';

interface MockGLTFLoader {
  load(
    path: string,
    onLoad: (gltf: GLTF) => void,
    onProgress?: unknown,
    onError?: (error: unknown) => void,
  ): void;
}

describe('AssetLoader backpressure', () => {
  it('caps concurrent GLTF loads', async () => {
    const loader = new AssetLoader(2);
    const mock = loader as unknown as { gltfLoader: MockGLTFLoader };
    const started: string[] = [];
    const resolvers = new Map<string, () => void>();
    let active = 0;
    let peak = 0;

    vi.spyOn(mock.gltfLoader, 'load').mockImplementation((path, onLoad) => {
      started.push(path);
      active += 1;
      peak = Math.max(peak, active);
      resolvers.set(path, () => {
        active -= 1;
        onLoad({ scene: new THREE.Group(), animations: [] } as unknown as GLTF);
      });
    });

    const loads = ['a.glb', 'b.glb', 'c.glb', 'd.glb'].map((path) => loader.loadGLTF(path));
    const flushQueue = async (): Promise<void> => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };

    expect(started).toEqual(['a.glb', 'b.glb']);

    resolvers.get('a.glb')?.();
    await flushQueue();
    expect(started).toEqual(['a.glb', 'b.glb', 'c.glb']);

    resolvers.get('b.glb')?.();
    await flushQueue();
    expect(started).toEqual(['a.glb', 'b.glb', 'c.glb', 'd.glb']);

    resolvers.get('c.glb')?.();
    resolvers.get('d.glb')?.();
    await Promise.all(loads);

    expect(peak).toBe(2);
  });
});
