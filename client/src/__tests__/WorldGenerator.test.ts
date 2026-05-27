// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { WorldGenerator } from '../systems/WorldGenerator';
import { WorldManifest } from '../state/WorldManifest';
import type { Minimap } from '../ui/Minimap';
import type { Terrain } from '../scene/Terrain';
import type { EntityManager } from '../entities/EntityManager';
import type { WebSocketClient } from '../network/WebSocketClient';

describe('WorldGenerator - minimap waypoint sync', () => {
  it('pushes manifest landmarks and terrain features into the minimap', () => {
    const scene = new THREE.Scene();
    const terrain = {} as unknown as Terrain;
    const entityManager = { npcs: new Map() } as unknown as EntityManager;
    const ws = {} as unknown as WebSocketClient;
    const generator = new WorldGenerator(scene, terrain, entityManager, ws);

    const minimap = { setWaypoints: vi.fn() } as unknown as Minimap;
    generator.setMinimap(minimap);
    generator.setWorldManifest(new WorldManifest());

    expect(minimap.setWaypoints).toHaveBeenCalledTimes(1);
    expect(minimap.setWaypoints).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'landmark:starting_pavilion',
          label: 'Origin Pavilion',
          x: 0,
          z: 0,
          kind: 'landmark',
        }),
        expect.objectContaining({
          id: 'feature:castle-hill',
          label: 'Castle Hill',
          x: -130,
          z: -190,
          kind: 'feature',
        }),
      ]),
    );
  });
});
