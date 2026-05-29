/**
 * encounters.ts — registers all built-in encounter types.
 *
 * Import this file once (in ProceduralPopulator) to activate all encounters.
 * To add a new encounter: create a builder in encounterBuilders.ts,
 * then call registerEncounter() here.
 */

import { BiomeType } from '../scene/Biomes';
import { registerEncounter } from './EncounterRegistry';
import {
  buildCampsite,
  buildBanditCamp,
  buildMerchantCaravan,
  buildHermitDwelling,
  buildMineEntrance,
  buildBattlefieldRemnant,
  buildFishingSpot,
  buildRitualSite,
  buildCrashedWagon,
} from './worldbuilder/objects/encounterBuilders';

// ── All biomes (no restriction) ───────────────────────────────────────────────

registerEncounter({
  id: 'campsite',
  name: 'Traveller Campsite',
  minDist: 70,
  chance: 0.12,
  buildFn: buildCampsite,
  npcs: [
    { idPrefix: 'traveller', name: 'Weary Traveller', maxHp: 80, hostile: false, scale: 1.0, offsetX: 1.5, offsetZ: -1.2, wanderRadius: 8 },
    { idPrefix: 'scout', name: 'Road Scout', maxHp: 90, hostile: false, scale: 1.0, offsetX: -1.8, offsetZ: 0.5, wanderRadius: 6 },
  ],
});

registerEncounter({
  id: 'crashed_wagon',
  name: 'Crashed Wagon',
  minDist: 80,
  chance: 0.08,
  buildFn: buildCrashedWagon,
  npcs: [
    { idPrefix: 'survivor', name: 'Wagon Survivor', maxHp: 60, hostile: false, scale: 1.0, offsetX: 3.0, offsetZ: -2.5, wanderRadius: 4 },
  ],
});

registerEncounter({
  id: 'ritual_site',
  name: 'Ancient Ritual Site',
  minDist: 100,
  chance: 0.07,
  buildFn: buildRitualSite,
  npcs: [
    { idPrefix: 'pilgrim', name: 'Silent Pilgrim', maxHp: 70, hostile: false, scale: 1.0, offsetX: 2.0, offsetZ: 0.0, wanderRadius: 5 },
  ],
});

// ── Teldrassil + wilderness ───────────────────────────────────────────────────

registerEncounter({
  id: 'hermit_dwelling',
  name: "Hermit's Dwelling",
  biomes: [BiomeType.Teldrassil],
  minDist: 90,
  chance: 0.09,
  buildFn: buildHermitDwelling,
  npcs: [
    { idPrefix: 'hermit', name: 'Forest Hermit', maxHp: 100, hostile: false, scale: 1.0, offsetX: 3.5, offsetZ: 0.0, wanderRadius: 6 },
  ],
});

// ── Combat zones (Ember Wastes, Tundra, Marsh) ────────────────────────────────

registerEncounter({
  id: 'bandit_camp',
  name: 'Bandit Encampment',
  biomes: [BiomeType.Teldrassil, BiomeType.SunlitMeadows, BiomeType.TwilightMarsh],
  minDist: 120,
  chance: 0.09,
  buildFn: buildBanditCamp,
  npcs: [
    { idPrefix: 'bandit_chief', name: 'Bandit Chief',   maxHp: 100, hostile: true, scale: 1.1, offsetX: 0.0,  offsetZ: -2.0, wanderRadius: 8 },
    { idPrefix: 'bandit_a',    name: 'Road Bandit',     maxHp: 55,  hostile: true, scale: 1.0, offsetX: 1.5,  offsetZ:  0.5, wanderRadius: 10 },
    { idPrefix: 'bandit_b',    name: 'Road Bandit',     maxHp: 55,  hostile: true, scale: 1.0, offsetX: -1.5, offsetZ:  1.0, wanderRadius: 10 },
  ],
});

registerEncounter({
  id: 'battlefield',
  name: 'Battlefield Remnant',
  biomes: [BiomeType.EmberWastes, BiomeType.CrystalTundra, BiomeType.TwilightMarsh],
  minDist: 130,
  chance: 0.08,
  buildFn: buildBattlefieldRemnant,
  // No NPCs — abandoned site
});

registerEncounter({
  id: 'mine_entrance',
  name: 'Abandoned Mine',
  biomes: [BiomeType.EmberWastes, BiomeType.CrystalTundra, BiomeType.Desert],
  minDist: 110,
  chance: 0.08,
  buildFn: buildMineEntrance,
  npcs: [
    { idPrefix: 'miner', name: 'Lost Miner', maxHp: 75, hostile: false, scale: 1.0, offsetX: 3.5, offsetZ: 0.5, wanderRadius: 5 },
  ],
});

// ── Meadows / friendly zones ──────────────────────────────────────────────────

registerEncounter({
  id: 'merchant_caravan',
  name: 'Merchant Caravan',
  biomes: [BiomeType.SunlitMeadows, BiomeType.Teldrassil],
  minDist: 100,
  chance: 0.07,
  buildFn: buildMerchantCaravan,
  npcs: [
    { idPrefix: 'merchant', name: 'Travelling Merchant', maxHp: 80,  hostile: false, scale: 1.0, offsetX: 2.5, offsetZ: -1.0, wanderRadius: 5 },
    { idPrefix: 'guard_a',  name: 'Caravan Guard',      maxHp: 110, hostile: false, scale: 1.1, offsetX: -3.5, offsetZ:  0.0, wanderRadius: 6 },
    { idPrefix: 'guard_b',  name: 'Caravan Guard',      maxHp: 110, hostile: false, scale: 1.1, offsetX:  4.5, offsetZ:  0.5, wanderRadius: 6 },
  ],
});

registerEncounter({
  id: 'fishing_spot',
  name: 'Fishing Spot',
  biomes: [BiomeType.SunlitMeadows, BiomeType.TwilightMarsh],
  minDist: 80,
  chance: 0.07,
  buildFn: buildFishingSpot,
  npcs: [
    { idPrefix: 'fisherman', name: 'Old Fisherman', maxHp: 60, hostile: false, scale: 1.0, offsetX: -0.2, offsetZ: -3.8, wanderRadius: 3 },
  ],
});
