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
    musicVolume: 0.7,
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

    // Browsers suspend the AudioContext when the tab is backgrounded, on power
    // saving, or after the machine sleeps. Once suspended it never resumes on
    // its own and Tone's Transport clock freezes, which is what made the music
    // and SFX go silent after a while. Resume it whenever the page is shown or
    // focused again, plus a periodic safety check for the still-visible case.
    const resumeAudio = (): void => {
      const context = Tone.getContext();
      if (context.state !== "running" && context.state !== "closed") {
        void context.resume();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") resumeAudio();
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", resumeAudio);
      window.setInterval(() => {
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          resumeAudio();
        }
      }, 5000);
    }
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  playStartMusic(): void {
    if (!this.initialized) return;
    this.stopCurrentMusic();
    // Halt and rewind the transport before scheduling. The clock must be parked
    // at tick 0 *while* we register the loops, then started — otherwise the tick-0
    // downbeat events fall into the scheduler's past as the clock advances during
    // setup and get dropped, leaving a silent first bar (the 1n pad is deferred a
    // whole bar). With a parked origin every loop's first fire lands together at
    // bar 0 / beat 0, and the tick-derived indices below all read 0 on that tick.
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    const bpm = 76 + Math.floor(Math.random() * 22);
    Tone.Transport.bpm.value = bpm;

    const semisUp = (note: string, semis: number): string =>
      Tone.Frequency(note).transpose(semis).toNote();

    // Fixed progression: a chromatic descent — Ab minor → G major → Gb major →
    // F minor — each as a root-position triad [root, third, fifth].
    const progression: string[][] = [
      ['Ab3', 'B3', 'Eb4'],  // Ab minor (Cb written as B)
      ['G3', 'B3', 'D4'],    // G major
      ['Gb3', 'Bb3', 'Db4'], // Gb major
      ['F3', 'A3', 'C4'],    // F major
    ];

    // Persistent voices — created once and retriggered each tick so the audio
    // graph stays a fixed size (no per-note allocation, no Draw-based disposal).
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.05 },
      volume: -24,
    }).connect(this.musicGain);
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
      volume: -30,
    }).connect(this.musicGain);
    const bassSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.3, sustain: 0, release: 0.4 },
      volume: -26,
    }).connect(this.musicGain);
    const chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.4, decay: 0.5, sustain: 0.15, release: 1.2 },
      volume: -19,
    }).connect(this.musicGain);
    const arpSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0, release: 0.2 },
      volume: -22,
    }).connect(this.musicGain);
    this.currentMusicNodes.push(kick, snare, bassSynth, chordSynth, arpSynth);

    // Arpeggio set per chord: the triad an octave above the pad, plus the root
    // two octaves up — i.e. scale-degrees [1, 3, 5, 8].
    const arpTones = progression.map((chord) => {
      const up = chord.map(n => semisUp(n, 12));
      return [up[0], up[1], up[2], semisUp(up[0], 12)];
    });

    // Bass per chord: root and fifth an octave below the pad.
    const bassTones = progression.map(chord => [semisUp(chord[0], -12), semisUp(chord[2], -12)]);

    // Every loop derives its musical position from the transport clock at the
    // callback time rather than a private counter. Private counters start at 0 on
    // each loop's first fire, which lands at a different absolute tick per
    // interval (4n vs 2n vs 1n vs 8n) depending on when playStartMusic runs
    // relative to Transport.start() — so the pad's bar N and the arp's bar N drift
    // apart. Anchoring all indices to absolute transport ticks (origin = tick 0)
    // keeps chord/bass/arp progressions locked together every load.
    const PPQ = Tone.Transport.PPQ;            // ticks per quarter note
    const ticksPerBar = PPQ * 4;               // 4/4
    const barIndexAt = (time: number): number =>
      Math.floor(Math.round(Tone.Transport.getTicksAtTime(time)) / ticksPerBar);
    const subdivInBarAt = (time: number, parts: number): number => {
      const tick = Math.round(Tone.Transport.getTicksAtTime(time));
      return Math.floor((tick % ticksPerBar) / (ticksPerBar / parts));
    };

    // ── Light pulse: soft kick on beat 1, gentle brush on beat 3 ──
    const beatInterval = Tone.Transport.scheduleRepeat((time) => {
      const barBeat = subdivInBarAt(time, 4);
      if (barBeat === 0) kick.triggerAttackRelease('C1', '32n', time);
      if (barBeat === 2) snare.triggerAttackRelease('32n', time);
    }, '4n');
    this.registerTransportEvent(beatInterval);

    // ── Bass: chord root on beat 1, fifth on beat 3 ──
    const bassInterval = Tone.Transport.scheduleRepeat((time) => {
      const [bassRoot, bassFifth] = bassTones[barIndexAt(time) % bassTones.length];
      const half = subdivInBarAt(time, 2);
      bassSynth.triggerAttackRelease(half === 0 ? bassRoot : bassFifth, '2n', time);
    }, '2n');
    this.registerTransportEvent(bassInterval);

    // ── Chords: hold one triad per bar (airy pad) ──
    const chordInterval = Tone.Transport.scheduleRepeat((time) => {
      chordSynth.triggerAttackRelease(progression[barIndexAt(time) % progression.length], '1n', time);
    }, '1n');
    this.registerTransportEvent(chordInterval);

    // ── Arpeggio: pattern 8-5-3-1-3-5-8-5 over the bar's chord ──
    // Degrees map to arp-set indices: 1→0 (root), 3→1, 5→2, 8→3 (octave).
    const arpPattern = [3, 2, 1, 0, 1, 2, 3, 2];
    const arpInterval = Tone.Transport.scheduleRepeat((time) => {
      const tones = arpTones[barIndexAt(time) % arpTones.length];
      const eighth = subdivInBarAt(time, 8);
      arpSynth.triggerAttackRelease(tones[arpPattern[eighth]], '8n', time);
    }, '8n');
    this.registerTransportEvent(arpInterval);

    // Release the parked clock now that all loops are registered; first fire of
    // each lands together on tick 0.
    Tone.Transport.start();
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
    // setTimeout, not Tone.Draw: Draw is rAF-driven and pauses when the tab is
    // backgrounded, which would leak this synth and eventually choke the audio
    // graph. setTimeout still fires in the background so the node is reclaimed.
    setTimeout(() => {
      const idx = this.currentMusicNodes.indexOf(synth);
      if (idx >= 0) this.currentMusicNodes.splice(idx, 1);
      synth.dispose();
    }, (totalDuration + 0.5) * 1000);
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
    const arpSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 },
      volume: -16,
    }).connect(this.musicGain);
    this.currentMusicNodes.push(arpSynth);
    let arpIndex = 0;
    const arpInterval = Tone.Transport.scheduleRepeat((time) => {
      if (scaleFreqs.length === 0) return;
      const freq = scaleFreqs[arpIndex % scaleFreqs.length];
      arpSynth.triggerAttackRelease(freq, '16n', time);
      arpIndex++;
    }, arpSpeed);
    this.registerTransportEvent(arpInterval);
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
    const arpSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 },
      volume: -16,
    }).connect(this.musicGain);
    this.currentMusicNodes.push(arpSynth);
    let arpIndex = 0;
    const arpInterval = Tone.Transport.scheduleRepeat((time) => {
      if (scaleFreqs.length === 0) return;
      const freq = scaleFreqs[arpIndex % scaleFreqs.length];
      arpSynth.triggerAttackRelease(freq, '16n', time);
      arpIndex++;
    }, arpSpeed);
    this.registerTransportEvent(arpInterval);
  }

  private registerTransportEvent(id: number): void {
    this.currentMusicNodes.push({
      dispose: () => Tone.Transport.clear(id),
    } as unknown as Tone.ToneAudioNode);
  }
}

function parseDuration(d: string): number {
  const map: Record<string, number> = {
    '2n': 2, '4n': 1, '8n': 0.5, '16n': 0.25,
    '1m': 4, '2m': 8,
  };
  return map[d] ?? 1;
}
