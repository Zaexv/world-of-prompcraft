import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

interface NPCConfigLike {
  id: string;
  name: string;
  position: THREE.Vector3;
  hp?: number;
  maxHp?: number;
  personality?: string;
  personalityKey?: string;
  scale?: number;
}

interface FakeNPC {
  id: string;
  mesh: THREE.Group;
  position: THREE.Vector3;
  homePosition: THREE.Vector3;
  nameplate: { updateHP: ReturnType<typeof vi.fn> };
  dispose: ReturnType<typeof vi.fn>;
}

const { createNPCMock } = vi.hoisted(() => ({
  createNPCMock: vi.fn((config: NPCConfigLike): FakeNPC => {
    const mesh = new THREE.Group();
    mesh.position.copy(config.position);
    if (config.scale !== undefined) {
      mesh.scale.setScalar(config.scale);
    }
    return {
      id: config.id,
      mesh,
      position: config.position.clone(),
      homePosition: config.position.clone(),
      nameplate: { updateHP: vi.fn() },
      dispose: vi.fn(),
    };
  }),
}));

vi.mock('../entities/NPC', () => ({
  NPC: { create: createNPCMock },
}));

import { EntityManager } from '../entities/EntityManager';

function makeConfig(id: string): NPCConfigLike {
  return {
    id,
    name: `NPC ${id}`,
    position: new THREE.Vector3(1, 2, 3),
    hp: 50,
    maxHp: 75,
    personality: 'Test personality',
    scale: 1.2,
  };
}

describe('EntityManager NPC sync', () => {
  afterEach(() => {
    createNPCMock.mockClear();
  });

  it('does not recreate an NPC when addNPC is called twice with same id', () => {
    const scene = new THREE.Scene();
    const manager = new EntityManager(scene);
    const config = makeConfig('guard_01');

    const first = manager.addNPC(config);
    const second = manager.addNPC(config);

    expect(first).toBe(second);
    expect(createNPCMock).toHaveBeenCalledTimes(1);
    expect(manager.getAllNPCs()).toHaveLength(1);
  });

  it('updates existing NPC stats via syncServerNPCs without recreating', () => {
    const scene = new THREE.Scene();
    const manager = new EntityManager(scene);
    const config = makeConfig('guard_02');

    manager.addNPC(config);
    manager.syncServerNPCs([{ ...config, hp: 42, maxHp: 90, scale: 1.5 }]);
    const npc = manager.getNPC(config.id) as unknown as FakeNPC;

    expect(createNPCMock).toHaveBeenCalledTimes(1);
    expect(npc.mesh.scale.x).toBeCloseTo(1.5);
    expect(npc.nameplate.updateHP).toHaveBeenCalledWith(42, 90);
  });

  it('prunes server NPCs that drop out of the nearby snapshot', () => {
    const scene = new THREE.Scene();
    const manager = new EntityManager(scene);

    manager.syncServerNPCs([makeConfig('guard_01'), makeConfig('merchant_01')]);
    expect(manager.getAllNPCs()).toHaveLength(2);

    // merchant_01 is no longer nearby -> should be removed.
    manager.syncServerNPCs([makeConfig('guard_01')]);
    expect(manager.getAllNPCs()).toHaveLength(1);
    expect(manager.getNPC('merchant_01')).toBeUndefined();
    expect(manager.getNPC('guard_01')).toBeDefined();
  });

  it('ignores proc_/enc_ NPCs in server sync (client populator owns them)', () => {
    const scene = new THREE.Scene();
    const manager = new EntityManager(scene);

    manager.syncServerNPCs([
      makeConfig('guard_01'),
      makeConfig('proc_spider_1_2_0'),
      makeConfig('enc_bandit_camp_0_0_0'),
    ]);

    expect(manager.getNPC('guard_01')).toBeDefined();
    expect(manager.getNPC('proc_spider_1_2_0')).toBeUndefined();
    expect(manager.getNPC('enc_bandit_camp_0_0_0')).toBeUndefined();
    expect(manager.getAllNPCs()).toHaveLength(1);
  });
});
