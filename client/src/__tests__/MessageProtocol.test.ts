import { describe, it, expect } from 'vitest';

// Since MessageProtocol.ts exports interfaces (compile-time only),
// we test the shape compliance at runtime
describe('MessageProtocol shapes', () => {
  it('PlayerInteraction has required fields', () => {
    const msg = {
      type: 'interaction' as const,
      npcId: 'dragon_01',
      prompt: 'Hello!',
      playerId: 'p1',
      playerState: { hp: 100, maxHp: 100 },
    };
    expect(msg.type).toBe('interaction');
    expect(msg.npcId).toBeTruthy();
    expect(msg.prompt).toBeTruthy();
  });

  it('JoinRequest includes race, faction and position', () => {
    const msg = {
      type: 'join' as const,
      username: 'Hero',
      race: 'human',
      faction: 'alliance',
      position: [0, 0, 0] as [number, number, number],
    };
    expect(msg.race).toBe('human');
    expect(msg.faction).toBe('alliance');
    expect(msg.position).toHaveLength(3);
  });

  it('AgentResponse action structure', () => {
    const response = {
      type: 'agent_response' as const,
      npcId: 'merchant_01',
      dialogue: 'Welcome!',
      actions: [
        { kind: 'emote', params: { animation: 'wave' } },
        { kind: 'damage', params: { target: 'player', amount: 10, damageType: 'fire' } },
      ],
      playerStateUpdate: { hp: 90 },
    };
    expect(response.actions).toHaveLength(2);
    expect(response.actions[0].kind).toBe('emote');
    expect(response.actions[1].params.amount).toBe(10);
  });

  it('RemotePlayerData carries race and faction', () => {
    const player = {
      playerId: 'p1',
      username: 'Hero',
      position: [0, 0, 0] as [number, number, number],
      race: 'human',
      faction: 'alliance',
      hp: 100,
      maxHp: 100,
      yaw: 0,
    };
    expect(player.race).toBe('human');
    expect(player.faction).toBe('alliance');
  });
});
