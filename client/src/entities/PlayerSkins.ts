export const PLAYER_RACES = ['human', 'night_elf', 'orc', 'undead'] as const;
export type PlayerRace = (typeof PLAYER_RACES)[number];

export const PLAYER_SKINS = ['skin-1', 'skin-2', 'skin-3', 'skin-4'] as const;
export type PlayerSkinId = (typeof PLAYER_SKINS)[number];

export interface PlayerSkinOption {
  id: PlayerSkinId;
  label: string;
  path: string;
}

export function isPlayerRace(value: string): value is PlayerRace {
  return (PLAYER_RACES as readonly string[]).includes(value);
}

export function isPlayerSkinId(value: string): value is PlayerSkinId {
  return (PLAYER_SKINS as readonly string[]).includes(value);
}

export function getDefaultPlayerSkin(): PlayerSkinId {
  return 'skin-1';
}

export function getPlayerSkinPath(race: string, skin: string): string {
  const resolvedRace = isPlayerRace(race) ? race : 'human';
  const resolvedSkin = isPlayerSkinId(skin) ? skin : getDefaultPlayerSkin();
  return `/models/player/${resolvedRace}/${resolvedSkin}.glb`;
}

export function getPlayerSkinOptions(race: string): PlayerSkinOption[] {
  const resolvedRace = isPlayerRace(race) ? race : 'human';
  return PLAYER_SKINS.map((skin) => ({
    id: skin,
    label: `Skin ${skin.split('-')[1]}`,
    path: getPlayerSkinPath(resolvedRace, skin),
  }));
}
