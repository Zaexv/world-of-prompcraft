import { describe, expect, it } from 'vitest';
import { createNPCMotionProfile } from '../entities/NPCMotion';

describe('createNPCMotionProfile', () => {
  it('maps guards to patrol style', () => {
    const profile = createNPCMotionProfile({
      id: 'guard_01',
      name: 'Captain Aldric',
      behavior: 'neutral',
    });

    expect(profile.style).toBe('patrol');
  });

  it('maps sages to float style', () => {
    const profile = createNPCMotionProfile({
      id: 'sage_01',
      name: 'Elyria',
      behavior: 'friendly',
    });

    expect(profile.style).toBe('float');
  });

  it('gives hostile roamers a distinct movement style', () => {
    const profile = createNPCMotionProfile({
      id: 'bandit_02',
      name: 'Road Stalker',
      behavior: 'hostile',
    });

    expect(['prowl', 'stomp']).toContain(profile.style);
  });

  it('stays deterministic for the same input', () => {
    const source = {
      id: 'citizen_12',
      name: 'Mira',
      behavior: 'friendly' as const,
      color: 0x88aa44,
    };

    expect(createNPCMotionProfile(source)).toEqual(createNPCMotionProfile(source));
  });
});
