/**
 * Configuration exports.
 * Central point for importing all configuration constants.
 */

export { GameConfig, type GameConfigType } from './GameConfig';
export { AssetPaths, type AssetPathsType } from './AssetPaths';
export { UIConfig, type UIConfigType } from './UIConfig';
export {
  NetworkConfig,
  type NetworkConfigType,
  getServerUrl,
  getApiUrl,
} from './NetworkConfig';
