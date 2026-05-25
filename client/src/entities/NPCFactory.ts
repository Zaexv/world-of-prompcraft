/**
 * NPCFactory — Factory pattern for NPC creation.
 *
 * Provides convenient factory methods for creating NPCs with asset loading.
 */

import type { NPC } from './NPC';
import type { NPCConfig } from './NPC';
import type { AssetLoader } from '../utils/AssetLoader';

/**
 * Factory for creating NPC instances.
 * Delegates to NPC.create() for the actual creation and GLTF loading.
 */
export class NPCFactory {
  constructor(private assetLoader?: AssetLoader) {}

  /**
   * Create an NPC with optional GLTF model upgrade.
   */
  async create(config: NPCConfig, NPCClass: typeof NPC): Promise<NPC> {
    return NPCClass.create(config, this.assetLoader);
  }
}
