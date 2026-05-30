import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WebSocketHandler } from '../core/WebSocketHandler';
import type { WSHandlerDeps } from '../core/WebSocketHandler';

function makeDeps(): WSHandlerDeps {
  const entityManager = {
    updateRemotePlayers: vi.fn(),
    syncServerNPCs: vi.fn(),
    addRemotePlayer: vi.fn(),
    getRemotePlayer: vi.fn(),
    removeRemotePlayer: vi.fn(),
    getNPC: vi.fn(),
  };

  const uiManager = {
    chatPanel: { addSystemMessage: vi.fn(), addMessage: vi.fn() },
    interactionPanel: { hideThinking: vi.fn(), addMessage: vi.fn(), updateMoodStatus: vi.fn() },
    combatHUD: {
      isVisible: false,
      updatePlayerHP: vi.fn(),
      updatePlayerMana: vi.fn(),
      updateNpcHP: vi.fn(),
      addLogEntry: vi.fn(),
    },
    addCombatLog: vi.fn(),
  };

  const deps = {
    runtime: { localPlayerId: 'local-player', joinedServer: true, activeNpcId: null },
    entityManager,
    uiManager,
    playerState: { hp: 100, maxHp: 100, mana: 50, maxMana: 50, playerId: 'local-player' },
    npcStateStore: { updateState: vi.fn() },
    reactionSystem: { handleResponse: vi.fn(), processActions: vi.fn() },
    worldBuilderPanel: {
      setResponse: vi.fn(),
      setReady: vi.fn(),
      startStreaming: vi.fn(),
      updateStreaming: vi.fn(),
      endStreaming: vi.fn(),
    },
    playerController: { position: new THREE.Vector3(), yaw: 0 },
    camera: new THREE.PerspectiveCamera(),
    scene: new THREE.Scene(),
    loginScreen: { hide: vi.fn(), showError: vi.fn() },
    loadingOverlay: { hide: vi.fn() },
    username: 'player',
    npcNameMap: new Map<string, string>(),
    HOSTILE_NPCS: new Set<string>(),
    startIntroCinematic: vi.fn(),
    spawnChatBubble: vi.fn(),
  };

  return deps as unknown as WSHandlerDeps;
}

describe('WebSocketHandler NPC sync', () => {
  it('routes world_update NPC snapshots through syncServerNPCs and filters local player', () => {
    const deps = makeDeps();
    const handler = new WebSocketHandler(deps);

    handler.handle({
      type: 'world_update',
      players: [
        { playerId: 'local-player', position: [0, 0, 0], yaw: 0 },
        { playerId: 'remote-player', position: [1, 0, 1], yaw: 1 },
      ],
      npcs: [
        { npc_id: 'npc_1', name: 'Guard', position: [2, 0, 2], hp: 40, maxHp: 80, mood: 'alert', scale: 1.1 },
        { name: 'Invalid NPC' },
      ],
    });

    expect(deps.entityManager.updateRemotePlayers).toHaveBeenCalledWith([
      { playerId: 'remote-player', position: [1, 0, 1], yaw: 1 },
    ]);
    expect(deps.entityManager.syncServerNPCs).toHaveBeenCalledTimes(1);
    expect(deps.entityManager.syncServerNPCs).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'npc_1', name: 'Guard' }),
    ]);
    expect(deps.npcStateStore.updateState).toHaveBeenCalledWith(
      'npc_1',
      expect.objectContaining({ hp: 40, maxHp: 80, mood: 'alert' }),
    );
  });
});
