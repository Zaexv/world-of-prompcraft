import { PlayerState } from "./PlayerState";
import { NPCStateStore } from "./NPCState";

/**
 * Top-level world state aggregator.
 */
export class WorldState {
  readonly playerState: PlayerState;
  readonly npcStateStore: NPCStateStore;

  private _weather = "clear";
  timeOfDay = "day";

  /** Called when weather changes. */
  onWeatherChange: ((weather: string) => void) | null = null;

  constructor(
    playerState: PlayerState,
    npcStateStore: NPCStateStore,
  ) {
    this.playerState = playerState;
    this.npcStateStore = npcStateStore;
  }

  get weather(): string {
    return this._weather;
  }

  set weather(value: string) {
    if (this._weather !== value) {
      this._weather = value;
      this.onWeatherChange?.(value);
    }
  }
}
