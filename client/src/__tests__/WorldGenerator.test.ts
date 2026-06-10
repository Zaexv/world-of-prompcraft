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
      // Teleportable destination type → becomes a teleport waypoint.
      { id: 'test_tower', type: 'tower', visual: { label: 'Test Tower' }, transform: { position: [1, 0, 2], scale: 1 } },
      // Decorative prop → filtered out (not a travel destination).
      { id: 'test_palm', type: 'malaka_palmtree', visual: { label: 'Palm' }, transform: { position: [5, 0, 6], scale: 1 } },
    ]);
    manifest.getTerrainFeatures = vi.fn().mockReturnValue([
      { id: 'test_f', transform: { x: 3, z: 4 } }
    ]);
    generator.setWorldManifest(manifest);

    expect(minimap.setWaypoints).toHaveBeenCalledTimes(1);
    const waypoints = (minimap.setWaypoints as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // Decorative prop is filtered out; only the tower + feature remain.
    expect(waypoints).toHaveLength(2);
    expect(waypoints.find((w: { id: string }) => w.id === 'landmark:test_palm')).toBeUndefined();
    expect(waypoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'landmark:test_tower',
          label: 'Test Tower',
          x: 1,
          z: 2,
          kind: 'teleport',
        }),
        expect.objectContaining({
          id: 'feature:test_f',
          label: 'Test F',
          x: 3,
          z: 4,
          kind: 'teleport',
        }),
      ]),
    );
  });
});
