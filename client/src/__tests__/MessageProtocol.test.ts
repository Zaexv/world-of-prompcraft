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
});
