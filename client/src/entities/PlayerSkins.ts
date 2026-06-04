export const PLAYER_RACES = ['human', 'night_elf', 'orc', 'undead'] as const;
export type PlayerRace = (typeof PLAYER_RACES)[number];
