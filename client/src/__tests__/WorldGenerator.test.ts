// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

// WorldGenerator transitively imports the mesh catalog, whose Málaga building kit
// eagerly builds canvas-based PBR textures. happy-dom has no canvas 2d context, so
// stub the PBR helpers (they're a no-op for this test's logic).
vi.mock('../utils/PBRMaps', () => ({
  warmUpTextures: vi.fn(),
  applyTerrainPBR: vi.fn(),
  applyCharacterPBR: vi.fn(),
  applyBarkPBR: vi.fn(),
  applyCanopyPBR: vi.fn(),
  applyStonePBR: vi.fn(),
  applyMalakaPBR: vi.fn(),
}));

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
    
    const manifest = new WorldManifest();
    manifest.getAllLandmarks = vi.fn().mockReturnValue([
      { id: 'test_l', visual: { label: 'Test L' }, transform: { position: [1, 0, 2] } }
    ]);
    manifest.getTerrainFeatures = vi.fn().mockReturnValue([
      { id: 'test_f', transform: { x: 3, z: 4 } }
    ]);
    generator.setWorldManifest(manifest);

    expect(minimap.setWaypoints).toHaveBeenCalledTimes(1);
    expect(minimap.setWaypoints).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'landmark:test_l',
          label: 'Test L',
          x: 1,
          z: 2,
          kind: 'landmark',
        }),
        expect.objectContaining({
          id: 'feature:test_f',
          label: 'Test F',
          x: 3,
          z: 4,
          kind: 'feature',
        }),
      ]),
    );
  });
});
