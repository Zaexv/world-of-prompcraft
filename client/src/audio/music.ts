export interface ZoneMusicDef {
  rootNote: string;
  scale: string[];
  bpm: number;
  padType: 'warm' | 'bright' | 'dark' | 'airy';
  arpSpeed: 'slow' | 'medium' | 'fast';
  bassOctave: number;
}

export const ZONE_MUSIC: Record<string, ZoneMusicDef> = {
  "Suarez Quarter": { rootNote: "D2", scale: ["D","E","F","G","A","Bb"], bpm: 55, padType: 'dark', arpSpeed: 'slow', bassOctave: 1 },
  "Fort Malaka":         { rootNote: "C2", scale: ["C","D","E","G","A"], bpm: 65, padType: 'warm', arpSpeed: 'slow', bassOctave: 2 },
  "Makaleta Strande":     { rootNote: "C2", scale: ["C","D","E","G","A"], bpm: 60, padType: 'warm', arpSpeed: 'slow', bassOctave: 2 },
  "Dark Forest":         { rootNote: "A2", scale: ["A","C","D","E","G"], bpm: 50, padType: 'dark', arpSpeed: 'slow', bassOctave: 1 },
  "Ember Peaks":         { rootNote: "D2", scale: ["D","E","F#","A","B"], bpm: 70, padType: 'bright', arpSpeed: 'medium', bassOctave: 2 },
  "Crystal Lake":        { rootNote: "G2", scale: ["G","A","C","D","E"], bpm: 55, padType: 'airy', arpSpeed: 'slow', bassOctave: 2 },
  "Blasted Suarezlands":        { rootNote: "E2", scale: ["E","F#","G","A","B","C"], bpm: 60, padType: 'dark', arpSpeed: 'medium', bassOctave: 1 },
  "Crystal Tundra":      { rootNote: "C2", scale: ["C","D","Eb","G","Ab"], bpm: 45, padType: 'airy', arpSpeed: 'slow', bassOctave: 2 },
  "Moin Swamps":      { rootNote: "F2", scale: ["F","G","Ab","C","D"], bpm: 50, padType: 'dark', arpSpeed: 'slow', bassOctave: 1 },
  "Malaka Area":      { rootNote: "C2", scale: ["C","D","E","G","A","B"], bpm: 65, padType: 'warm', arpSpeed: 'medium', bassOctave: 2 },
  "Teldrassil Wilds":    { rootNote: "G2", scale: ["G","A","B","D","E"], bpm: 60, padType: 'warm', arpSpeed: 'slow', bassOctave: 2 },
};
