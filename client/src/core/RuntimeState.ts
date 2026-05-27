export interface RuntimeState {
  localPlayerId: string;
  joinedServer: boolean;
  activeNpcId: string | null;
  inDungeonOverride: boolean;
}

export function createRuntimeState(): RuntimeState {
  return { localPlayerId: 'default', joinedServer: false, activeNpcId: null, inDungeonOverride: false };
}
