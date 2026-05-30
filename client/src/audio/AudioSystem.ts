import * as Tone from 'tone';
import { SFX } from './effects';
import { ZONE_MUSIC } from './music';

export interface AudioConfig {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
}

export interface NoteDef {
  note: string;
  duration: string;
  time: number;
}

export class AudioSystem {
  private static instance: AudioSystem;

  private masterGain: Tone.Gain;
  private sfxGain: Tone.Gain;
  private musicGain: Tone.Gain;

  private currentMusicNodes: Tone.ToneAudioNode[] = [];
  private currentZone = '';
  private initialized = false;

  private config: AudioConfig = {
    masterVolume: 0.8,
    musicVolume: 0.10,
    sfxVolume: 0.8,
  };

  private constructor() {
    this.masterGain = new Tone.Gain(this.config.masterVolume).toDestination();
    this.sfxGain = new Tone.Gain(this.config.sfxVolume).connect(this.masterGain);
    this.musicGain = new Tone.Gain(this.config.musicVolume).connect(this.masterGain);
  }

  static getInstance(): AudioSystem {
    if (!AudioSystem.instance) {
      AudioSystem.instance = new AudioSystem();
    }
    return AudioSystem.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await Tone.start();
    Tone.Transport.start();
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  playStartMusic(): void {
    if (!this.initialized) return;
    this.stopCurrentMusic();
    const roots = ['C2', 'D2', 'E2', 'F2', 'G2', 'A2'];
    const scalesList: { name: string; notes: string[] }[] = [
      { name: 'major', notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
      { name: 'minor', notes: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'] },
      { name: 'pentatonic', notes: ['C', 'D', 'E', 'G', 'A'] },
    ];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const entry = scalesList[Math.floor(Math.random() * scalesList.length)];
    const bpm = 120 + Math.floor(Math.random() * 40);
    const scale = entry.notes;
    const octave = parseInt(root.slice(-1), 10) || 2;

    Tone.Transport.bpm.value = bpm;

    const scalePitches = scale.map(s => s + String(octave + 1));
    const bassPitches = scale.map(s => s + String(octave));

    // ── Kick on beat 1 & 3, snare/click on 2 & 4 ──
    let beat4 = 0;
    const beatInterval = Tone.Transport.scheduleRepeat(() => {
      const barBeat = beat4 % 4;
      if (barBeat === 0 || barBeat === 2) {
        const k = new Tone.MembraneSynth({
          pitchDecay: 0.02,
          octaves: 3,
          envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.05 },
          volume: -16,
        }).connect(this.musicGain);
        this.currentMusicNodes.push(k);
        k.triggerAttackRelease('C1', '32n');
        Tone.Draw.schedule(() => {
          const idx = this.currentMusicNodes.indexOf(k);
          if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
          k.dispose();
        }, Tone.now() + 0.2);
      }
      if (barBeat === 1 || barBeat === 3) {
        const s = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
          volume: -20,
        }).connect(this.musicGain);
        this.currentMusicNodes.push(s);
        s.triggerAttackRelease('32n');
        Tone.Draw.schedule(() => {
          const idx = this.currentMusicNodes.indexOf(s);
          if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
          s.dispose();
        }, Tone.now() + 0.1);
      }
      beat4++;
    }, '4n');

    if (beatInterval) {
      this.currentMusicNodes.push({ dispose: () => Tone.Transport.clear(beatInterval) } as unknown as Tone.ToneAudioNode);
    }

    // ── Bass: two-beat pattern, root → fifth ──
    let bass2 = 0;
    const bassInterval = Tone.Transport.scheduleRepeat(() => {
      const noteIdx = bass2 % 2 === 0 ? 0 : Math.min(4, scale.length - 1);
      const synth = new Tone.Synth({
        oscillator: { type: 'pwm' },
        envelope: { attack: 0.02, decay: 0.2, sustain: 0, release: 0.3 },
        volume: -22,
      }).connect(this.musicGain);
      this.currentMusicNodes.push(synth);
      synth.triggerAttackRelease(bassPitches[noteIdx], '2n');
      Tone.Draw.schedule(() => {
        const idx = this.currentMusicNodes.indexOf(synth);
        if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
        synth.dispose();
      }, Tone.now() + 1.5);
      bass2++;
    }, '2n');

    if (bassInterval) {
      this.currentMusicNodes.push({ dispose: () => Tone.Transport.clear(bassInterval) } as unknown as Tone.ToneAudioNode);
    }

    // ── Chords: triad every 2 beats ──
    let chord2 = 0;
    const chordInterval = Tone.Transport.scheduleRepeat(() => {
      const rootIdx = (chord2 * 2) % scale.length;
      const chordNotes = [
        scalePitches[rootIdx % scalePitches.length],
        scalePitches[(rootIdx + 2) % scalePitches.length],
        scalePitches[(rootIdx + 4) % scalePitches.length],
      ];
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.3, sustain: 0, release: 0.4 },
        volume: -16,
      }).connect(this.musicGain);
      synth.triggerAttackRelease(chordNotes, '2n');
      this.currentMusicNodes.push(synth);
      Tone.Draw.schedule(() => {
        const idx = this.currentMusicNodes.indexOf(synth);
        if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
        synth.dispose();
      }, Tone.now() + 2);
      chord2++;
    }, '2n');

    if (chordInterval) {
      this.currentMusicNodes.push({ dispose: () => Tone.Transport.clear(chordInterval) } as unknown as Tone.ToneAudioNode);
    }

    // ── Melody: rising/falling through the scale ──
    let mel8 = 0;
    const melInterval = Tone.Transport.scheduleRepeat(() => {
      const step = mel8 % (scalePitches.length * 2 - 2 || 1);
      const idx = step < scalePitches.length ? step : (scalePitches.length * 2 - 2) - step;
      const synth = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.15 },
        volume: -14,
      }).connect(this.musicGain);
      this.currentMusicNodes.push(synth);
      synth.triggerAttackRelease(scalePitches[idx], '8n');
      Tone.Draw.schedule(() => {
        const di = this.currentMusicNodes.indexOf(synth);
        if (di >= 0) this.currentMusicNodes.splice(di, 1);
        synth.dispose();
      }, Tone.now() + 0.4);
      mel8++;
    }, '8n');

    if (melInterval) {
      this.currentMusicNodes.push({ dispose: () => Tone.Transport.clear(melInterval) } as unknown as Tone.ToneAudioNode);
    }
  }

  setMasterVolume(v: number): void {
    this.config.masterVolume = v;
    this.masterGain.gain.rampTo(v, 0.1);
  }

  setSfxVolume(v: number): void {
    this.config.sfxVolume = v;
    this.sfxGain.gain.rampTo(v, 0.1);
  }

  setMusicVolume(v: number): void {
    this.config.musicVolume = v;
    this.musicGain.gain.rampTo(v, 0.3);
  }

  getConfig(): AudioConfig {
    return { ...this.config };
  }

  playSfx(name: string): void {
    if (!this.initialized) return;
    const def = SFX[name];
    if (def) {
      def.play(this.sfxGain);
    }
  }

  setZoneMusic(zone: string): void {
    if (!this.initialized) return;
    if (zone === this.currentZone) return;
    this.currentZone = zone;
    this.stopCurrentMusic();
    const zoneDef = ZONE_MUSIC[zone];
    if (!zoneDef) return;
    this.startZoneAmbient(zoneDef);
  }

  playMoodMusic(mood: string, _duration?: number): void {
    if (!this.initialized) return;
    this.stopCurrentMusic();
    const moodMap: Record<string, { root: string; scale: string[]; bpm: number }> = {
      battle: { root: 'D2', scale: ['D', 'E', 'F', 'G', 'A', 'Bb'], bpm: 140 },
      mystery: { root: 'C2', scale: ['C', 'Db', 'Eb', 'F', 'G', 'Ab'], bpm: 50 },
      celebration: { root: 'C2', scale: ['C', 'D', 'E', 'F', 'G', 'A'], bpm: 120 },
      sadness: { root: 'A2', scale: ['A', 'B', 'C', 'D', 'E', 'F'], bpm: 45 },
      tension: { root: 'E2', scale: ['E', 'F', 'G', 'Ab', 'Bb', 'C'], bpm: 60 },
      triumph: { root: 'C2', scale: ['C', 'D', 'E', 'G', 'A'], bpm: 100 },
      exploration: { root: 'G2', scale: ['G', 'A', 'B', 'D', 'E'], bpm: 65 },
    };
    const def = moodMap[mood];
    if (!def) return;
    this.startMoodMusic(def);
  }

  playMusicSequence(notes: NoteDef[]): void {
    if (!this.initialized || notes.length === 0) return;
    const now = Tone.now();
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.5 },
    }).connect(this.musicGain);
    this.currentMusicNodes.push(synth);
    for (const n of notes) {
      synth.triggerAttackRelease(n.note, n.duration, now + n.time);
    }
    const totalDuration = Math.max(...notes.map(n => n.time + parseDuration(n.duration)));
    Tone.Draw.schedule(() => {
      const idx = this.currentMusicNodes.indexOf(synth);
      if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
      synth.dispose();
    }, now + totalDuration + 0.5);
  }

  dispose(): void {
    this.stopCurrentMusic();
    Tone.Transport.stop();
    Tone.Transport.cancel();
  }

  // ── Private ──────────────────────────────────────────────────────────

  private stopCurrentMusic(): void {
    for (const node of this.currentMusicNodes) {
      node.dispose();
    }
    this.currentMusicNodes = [];
  }

  private startZoneAmbient(def: typeof ZONE_MUSIC[string]): void {
    const freqMap: Record<string, number> = {
      C: 261.63, Db: 277.18, D: 293.66, Eb: 311.13, E: 329.63,
      F: 349.23, Gb: 369.99, G: 392.00, Ab: 415.30, A: 440.00,
      Bb: 466.16, B: 493.88,
    };
    const octave = parseInt(def.rootNote.slice(-1), 10) || 2;

    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 2, decay: 1, sustain: 0.6, release: 4 },
      volume: -12,
    }).connect(this.musicGain);
    this.currentMusicNodes.push(pad);

    const bass = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 2 },
      volume: -10,
    }).connect(this.musicGain);
    this.currentMusicNodes.push(bass);

    const scaleFreqs = def.scale
      .map(s => (freqMap[s] || 261.63) * Math.pow(2, (octave + 1) - 4))
      .filter(f => f > 0);

    const now = Tone.now();
    bass.triggerAttack(def.rootNote, now);

    const padNotes = def.scale
      .filter((_, i) => i % 2 === 0)
      .slice(0, 3)
      .map(s => s + (octave + 1));
    for (const n of padNotes) {
      pad.triggerAttack(n, now);
    }

    const arpSpeed = def.arpSpeed === 'fast' ? 0.15 : def.arpSpeed === 'medium' ? 0.3 : 0.5;
    let arpIndex = 0;
    const arpInterval = Tone.Transport.scheduleRepeat(() => {
      if (scaleFreqs.length === 0) return;
      const freq = scaleFreqs[arpIndex % scaleFreqs.length];
      const arpSynth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 },
        volume: -16,
      }).connect(this.musicGain);
      this.currentMusicNodes.push(arpSynth);
      arpSynth.triggerAttackRelease(freq, '16n');
      Tone.Draw.schedule(() => {
        const idx = this.currentMusicNodes.indexOf(arpSynth);
        if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
        arpSynth.dispose();
      }, Tone.now() + 0.5);
      arpIndex++;
    }, arpSpeed);

    if (arpInterval) {
      this.currentMusicNodes.push({ dispose: () => Tone.Transport.clear(arpInterval) } as unknown as Tone.ToneAudioNode);
    }
  }

  private startMoodMusic(def: { root: string; scale: string[]; bpm: number }): void {
    Tone.Transport.bpm.value = def.bpm;
    const freqMap: Record<string, number> = {
      C: 261.63, Db: 277.18, D: 293.66, Eb: 311.13, E: 329.63,
      F: 349.23, Gb: 369.99, G: 392.00, Ab: 415.30, A: 440.00,
      Bb: 466.16, B: 493.88,
    };
    const octave = parseInt(def.root.slice(-1), 10) || 2;
    const scaleFreqs = def.scale
      .map(s => (freqMap[s] || 261.63) * Math.pow(2, octave - 4))
      .filter(f => f > 0);

    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 1, decay: 0.5, sustain: 0.5, release: 3 },
      volume: -12,
    }).connect(this.musicGain);
    this.currentMusicNodes.push(pad);

    const bass = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.3, decay: 0.3, sustain: 0.7, release: 1.5 },
      volume: -10,
    }).connect(this.musicGain);
    this.currentMusicNodes.push(bass);

    const now = Tone.now();
    bass.triggerAttack(def.root, now);
    const padNotes = def.scale.slice(0, 2).map(s => s + (octave + 1));
    for (const n of padNotes) {
      pad.triggerAttack(n, now);
    }

    const arpSpeed = def.bpm > 100 ? 0.15 : 0.4;
    let arpIndex = 0;
    const arpInterval = Tone.Transport.scheduleRepeat(() => {
      if (scaleFreqs.length === 0) return;
      const freq = scaleFreqs[arpIndex % scaleFreqs.length];
      const arpSynth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 },
        volume: -16,
      }).connect(this.musicGain);
      this.currentMusicNodes.push(arpSynth);
      arpSynth.triggerAttackRelease(freq, '16n');
      Tone.Draw.schedule(() => {
        const idx = this.currentMusicNodes.indexOf(arpSynth);
        if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
        arpSynth.dispose();
      }, Tone.now() + 0.5);
      arpIndex++;
    }, arpSpeed);

    if (arpInterval) {
      this.currentMusicNodes.push({ dispose: () => Tone.Transport.clear(arpInterval) } as unknown as Tone.ToneAudioNode);
    }
  }
}

function parseDuration(d: string): number {
  const map: Record<string, number> = {
    '2n': 2, '4n': 1, '8n': 0.5, '16n': 0.25,
    '1m': 4, '2m': 8,
  };
  return map[d] ?? 1;
}
