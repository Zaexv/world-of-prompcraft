import * as Tone from 'tone';

export interface SfxDefinition {
  play: (destination: Tone.ToneAudioNode) => void;
}

function noiseSynth(duration: number, filterFreq: number, volume = -8): Tone.NoiseSynth {
  return new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.01, decay: duration * 0.7, sustain: 0, release: duration * 0.3 },
    volume,
  }).chain(
    new Tone.Filter(filterFreq, 'lowpass').chain(
      new Tone.Gain(1),
    ),
  );
}

function shortSynth(type: OscillatorType, freq: number, duration: number, volume = -6): Tone.Synth {
  return new Tone.Synth({
    oscillator: { type },
    envelope: { attack: 0.01, decay: duration * 0.5, sustain: 0, release: duration * 0.5 },
    volume,
  });
}

export const SFX: Record<string, SfxDefinition> = {
  hit: {
    play(dest) {
      const n = noiseSynth(0.15, 800, -10);
      const s = shortSynth('triangle', 120, 0.1, -8);
      n.connect(dest);
      s.connect(dest);
      n.triggerAttackRelease('8n');
      s.triggerAttackRelease('C2', '32n');
      Tone.Draw.schedule(() => { n.dispose(); s.dispose(); }, Tone.now() + 0.3);
    },
  },

  heal: {
    play(dest) {
      const notes = ['C4', 'E4', 'G4', 'C5'];
      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.1, release: 0.4 },
        volume: -8,
      }).connect(dest);
      const now = Tone.now();
      notes.forEach((n, i) => synth.triggerAttackRelease(n, '8n', now + i * 0.1));
      Tone.Draw.schedule(() => synth.dispose(), now + 1);
    },
  },

  fire: {
    play(dest) {
      const n = noiseSynth(0.4, 3000, -6);
      n.connect(dest);
      n.triggerAttackRelease('4n');
      const filter = new Tone.Filter(3000, 'lowpass');
      filter.frequency.rampTo(200, 0.3);
      n.connect(filter);
      filter.connect(dest);
      Tone.Draw.schedule(() => { n.dispose(); filter.dispose(); }, Tone.now() + 0.6);
    },
  },

  ice: {
    play(dest) {
      const synth = new Tone.Synth({
        oscillator: { type: 'fmsquare' },
        envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.2 },
        volume: -10,
      }).connect(dest);
      const now = Tone.now();
      synth.triggerAttackRelease('E6', '4n', now);
      synth.triggerAttackRelease('G6', '8n', now + 0.1);
      synth.triggerAttackRelease('C7', '16n', now + 0.2);
      Tone.Draw.schedule(() => synth.dispose(), now + 1);
    },
  },

  lightning: {
    play(dest) {
      const n = noiseSynth(0.25, 10000, -4);
      n.connect(dest);
      n.triggerAttackRelease('16n');
      const synth = shortSynth('square', 60, 0.05, -12);
      synth.connect(dest);
      synth.triggerAttackRelease('C1', '64n');
      Tone.Draw.schedule(() => { n.dispose(); synth.dispose(); }, Tone.now() + 0.4);
    },
  },

  sparkle: {
    play(dest) {
      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.2 },
        volume: -10,
      }).connect(dest);
      const now = Tone.now();
      synth.triggerAttackRelease('C6', '32n', now);
      synth.triggerAttackRelease('E6', '32n', now + 0.05);
      synth.triggerAttackRelease('G6', '32n', now + 0.1);
      Tone.Draw.schedule(() => synth.dispose(), now + 0.4);
    },
  },

  explosion: {
    play(dest) {
      const n = noiseSynth(0.6, 500, -2);
      n.connect(dest);
      n.triggerAttackRelease('2n');
      const s = shortSynth('sine', 40, 0.5, -4);
      s.connect(dest);
      s.triggerAttackRelease('C1', '4n');
      Tone.Draw.schedule(() => { n.dispose(); s.dispose(); }, Tone.now() + 0.8);
    },
  },

  ui_click: {
    play(dest) {
      const s = shortSynth('square', 800, 0.04, -16);
      s.connect(dest);
      s.triggerAttackRelease('C5', '64n');
      Tone.Draw.schedule(() => s.dispose(), Tone.now() + 0.1);
    },
  },

  ui_hover: {
    play(dest) {
      const s = shortSynth('sine', 1000, 0.06, -20);
      s.connect(dest);
      s.triggerAttackRelease('E5', '64n');
      Tone.Draw.schedule(() => s.dispose(), Tone.now() + 0.1);
    },
  },

  ui_alert: {
    play(dest) {
      const s = shortSynth('square', 440, 0.15, -12);
      s.connect(dest);
      s.triggerAttackRelease('A4', '32n');
      Tone.Draw.schedule(() => s.dispose(), Tone.now() + 0.3);
    },
  },

  quest_start: {
    play(dest) {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.6 },
        volume: -8,
      }).connect(dest);
      const now = Tone.now();
      synth.triggerAttackRelease(['C4', 'E4', 'G4'], '4n', now);
      synth.triggerAttackRelease(['C5', 'E5', 'G5'], '2n', now + 0.5);
      Tone.Draw.schedule(() => synth.dispose(), now + 2);
    },
  },

  quest_complete: {
    play(dest) {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.8 },
        volume: -6,
      }).connect(dest);
      const now = Tone.now();
      synth.triggerAttackRelease(['G4', 'B4', 'D5'], '2n', now);
      synth.triggerAttackRelease(['G5', 'B5', 'D6'], '4n', now + 0.8);
      Tone.Draw.schedule(() => synth.dispose(), now + 2);
    },
  },

  item_pickup: {
    play(dest) {
      const s = shortSynth('sine', 1200, 0.12, -10);
      s.connect(dest);
      s.triggerAttackRelease('E6', '32n');
      Tone.Draw.schedule(() => s.dispose(), Tone.now() + 0.2);
    },
  },

  emote: {
    play(dest) {
      const s = shortSynth('triangle', 600, 0.2, -10);
      s.connect(dest);
      const now = Tone.now();
      s.triggerAttackRelease('C5', '16n', now);
      s.triggerAttackRelease('E5', '16n', now + 0.12);
      Tone.Draw.schedule(() => s.dispose(), now + 0.4);
    },
  },

  footstep: {
    play(dest) {
      const n = noiseSynth(0.06, 400, -35);
      n.connect(dest);
      n.triggerAttackRelease('64n');
      Tone.Draw.schedule(() => n.dispose(), Tone.now() + 0.1);
    },
  },

  jump: {
    play(dest) {
      const s = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.08 },
        volume: -14,
      }).connect(dest);
      const now = Tone.now();
      s.triggerAttackRelease('C4', '16n', now);
      // Quick upward pitch sweep gives a springy "boing" lift-off.
      s.frequency.setValueAtTime('C4', now);
      s.frequency.exponentialRampToValueAtTime('G4', now + 0.12);
      Tone.Draw.schedule(() => s.dispose(), now + 0.3);
    },
  },

  water_step: {
    play(dest) {
      // Swoosh: pink noise that swells in and out through a band-pass filter
      // sweeping up then back down — water being pushed aside and rushing back,
      // rather than a sharp percussive splash.
      const n = new Tone.NoiseSynth({
        noise: { type: 'pink' },
        // Long tail: water keeps sloshing for a while after the footfall, so it
        // sustains gently then fades out slowly rather than cutting off.
        envelope: { attack: 0.1, decay: 0.5, sustain: 0.18, release: 0.7 },
        volume: -16,
      });
      const filter = new Tone.Filter({ type: 'bandpass', frequency: 300, Q: 1.1 });
      const now = Tone.now();
      // Rising-then-slowly-falling sweep is the "moving water" motion: it surges
      // up quickly, then takes its time settling back as the water comes to rest.
      filter.frequency.setValueAtTime(250, now);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 0.18);
      filter.frequency.exponentialRampToValueAtTime(350, now + 0.95);
      n.connect(filter);
      filter.connect(dest);
      n.triggerAttackRelease(0.6, now);
      Tone.Draw.schedule(() => { n.dispose(); filter.dispose(); }, now + 1.4);
    },
  },

  death: {
    play(dest) {
      const s = shortSynth('sawtooth', 150, 0.8, -8);
      s.connect(dest);
      s.triggerAttackRelease('C2', '2n');
      const filter = new Tone.Filter(150, 'lowpass');
      filter.frequency.rampTo(40, 0.6);
      s.connect(filter);
      filter.connect(dest);
      Tone.Draw.schedule(() => { s.dispose(); filter.dispose(); }, Tone.now() + 1);
    },
  },

  respawn: {
    play(dest) {
      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.1, decay: 0.3, sustain: 0.2, release: 0.5 },
        volume: -8,
      }).connect(dest);
      const now = Tone.now();
      synth.triggerAttackRelease('C4', '4n', now);
      synth.triggerAttackRelease('E4', '4n', now + 0.2);
      synth.triggerAttackRelease('G4', '2n', now + 0.4);
      Tone.Draw.schedule(() => synth.dispose(), now + 1.5);
    },
  },
};
