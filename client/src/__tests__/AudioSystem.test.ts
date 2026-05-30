import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone.js before importing AudioSystem
vi.mock('tone', () => {
  const chainable = {
    connect: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    triggerAttackRelease: vi.fn(),
    triggerAttack: vi.fn(),
  };
  const mockGain = {
    gain: { rampTo: vi.fn() },
    toDestination: vi.fn().mockReturnThis(),
    connect: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    chain: vi.fn(() => chainable),
  };
  const mockSynth = {
    connect: vi.fn().mockReturnThis(),
    triggerAttack: vi.fn(),
    triggerAttackRelease: vi.fn(),
    dispose: vi.fn(),
  };
  const mockPolySynth = {
    connect: vi.fn().mockReturnThis(),
    triggerAttack: vi.fn(),
    triggerAttackRelease: vi.fn(),
    dispose: vi.fn(),
  };
  const mockFilter = {
    chain: vi.fn(() => chainable),
    connect: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
  };
  const mockWithChain = {
    ...mockSynth,
    chain: vi.fn(() => chainable),
  };
  return {
    Gain: vi.fn(() => mockGain),
    Synth: vi.fn(() => ({ ...mockSynth, chain: vi.fn().mockReturnThis() })),
    MembraneSynth: vi.fn(() => ({ ...mockSynth, chain: vi.fn().mockReturnThis() })),
    PolySynth: vi.fn(() => mockPolySynth),
    NoiseSynth: vi.fn(() => mockWithChain),
    Filter: vi.fn(() => mockFilter),
    start: vi.fn().mockResolvedValue(undefined),
    Transport: {
      bpm: { value: 70 },
      start: vi.fn(),
      stop: vi.fn(),
      cancel: vi.fn(),
      scheduleRepeat: vi.fn(() => 'mockInterval'),
      clear: vi.fn(),
    },
    Draw: {
      schedule: vi.fn(),
    },
    now: vi.fn(() => 0),
  };
});

describe('AudioSystem', () => {
  beforeEach(() => {
    // Reset module state between tests
    vi.resetModules();
  });

  it('should be a singleton', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    const b = AudioSystem.getInstance();
    expect(a).toBe(b);
  });

  it('should init and call Tone.start', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const tone = await import('tone');
    const a = AudioSystem.getInstance();
    await a.init();
    expect(tone.start).toHaveBeenCalled();
    expect(a.isInitialized).toBe(true);
  });

  it('should set master volume', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const tone = await import('tone');
    const a = AudioSystem.getInstance();
    await a.init();
    a.setMasterVolume(0.5);
    const config = a.getConfig();
    expect(config.masterVolume).toBe(0.5);
    expect(tone.Gain).toHaveBeenCalled();
  });

  it('should set music volume', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    a.setMusicVolume(0.3);
    const config = a.getConfig();
    expect(config.musicVolume).toBe(0.3);
  });

  it('should set sfx volume', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    a.setSfxVolume(0.4);
    const config = a.getConfig();
    expect(config.sfxVolume).toBe(0.4);
  });

  it('should get config', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    const config = a.getConfig();
    expect(config).toHaveProperty('masterVolume');
    expect(config).toHaveProperty('musicVolume');
    expect(config).toHaveProperty('sfxVolume');
  });

  it('should play SFX without throwing', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    expect(() => a.playSfx('hit')).not.toThrow();
    expect(() => a.playSfx('heal')).not.toThrow();
    expect(() => a.playSfx('ui_click')).not.toThrow();
    expect(() => a.playSfx('quest_start')).not.toThrow();
  });

  it('should play mood music without throwing', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    expect(() => a.playMoodMusic('battle')).not.toThrow();
    expect(() => a.playMoodMusic('mystery')).not.toThrow();
  });

  it('should play music sequence without throwing', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    const notes = [
      { note: 'C4', duration: '4n', time: 0 },
      { note: 'E4', duration: '4n', time: 0.5 },
    ];
    expect(() => a.playMusicSequence(notes)).not.toThrow();
  });

  it('should set zone music', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    expect(() => a.setZoneMusic("Elders' Village")).not.toThrow();
    expect(() => a.setZoneMusic("Dark Forest")).not.toThrow();
  });

  it('should not throw on unknown zone', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    expect(() => a.setZoneMusic('Unknown Zone')).not.toThrow();
  });

  it('should not throw when not initialized', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    // Without calling init(), these should still not throw
    expect(() => a.playSfx('hit')).not.toThrow();
    expect(() => a.setZoneMusic("Elders' Village")).not.toThrow();
    expect(() => a.playStartMusic()).not.toThrow();
  });

  it('should play start music without throwing', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    expect(() => a.playStartMusic()).not.toThrow();
  });

  it('should dispose without error', async () => {
    const { AudioSystem } = await import('../audio/AudioSystem');
    const a = AudioSystem.getInstance();
    await a.init();
    expect(() => a.dispose()).not.toThrow();
  });
});
