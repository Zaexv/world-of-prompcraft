/**
 * Tracks the player's current zone based on world coordinates.
 *
 * Mirrors the zones from server/src/world/zones.py exactly.
 *
 * Zones are DERIVED from the radial biome model (see scene/Biomes.ts), not from
 * overlapping rectangles. This guarantees zones never overlap:
 *
 *   1. A small set of named LOCALE_DISCS (Makaleta Strande, Fort Malaka) are
 *      checked first. They are placed so they never overlap each other.
 *   2. Everything else falls back to the dominant biome sector at that position,
 *      which is itself a clean angular partition (boundaries at sector midpoints).
 *
 * Because the outer ring is a single argmax-over-angle partition, two ring zones
 * can never claim the same point — fixing the old rectangle overlap.
 */

import { getDominantBiome, BIOME_ZONE_NAMES } from "../scene/Biomes";

export interface ZoneData {
  name: string;
  description: string;
  /** Representative world position used to anchor the map label. */
  labelX: number;
  labelZ: number;
}

interface LocaleDisc {
  name: string;
  x: number;
  z: number;
  radius: number;
}

/**
 * Named inner locales that override the radial biome sector. They must not
 * overlap each other. Checked from smallest radius to largest.
 */
export const LOCALE_DISCS: LocaleDisc[] = [
  // Central hub disc — the spawn village at the heart of the world.
  { name: "Makaleta Strande", x: 0, z: 0, radius: 95 },
  // Mediterranean fort pocket carved out of the SW (Malaka Area) sector.
  // Covers the fort buildings clustered near (-277,-299)..(-118,-318).
  { name: "Fort Malaka", x: -210, z: -260, radius: 135 },
];

/**
 * Zone metadata keyed by name. Descriptions mirror server/src/world/zones.py.
 * `labelX/labelZ` anchor the world-map region label.
 */
export const ZONES: ZoneData[] = [
  {
    name: "Makaleta Strande",
    description:
      "A peaceful village at the heart of the world, where wise elders share ancient knowledge.",
    labelX: 0,
    labelZ: 0,
  },
  {
    name: "Fort Malaka",
    description:
      "A fortified Mediterranean city built on ancient ley lines. White-walled casitas with terracotta roofs line palm-shaded streets, and the golden Playa de la Malagueta stretches along its southern shore.",
    labelX: -210,
    labelZ: -260,
  },
  {
    name: "Teldrassil Wilds",
    description:
      "The ancient forest surrounding Makaleta Strande. Massive trees draped with glowing vines tower above a carpet of luminescent mushrooms. Wisps drift between the trunks.",
    labelX: 95, labelZ: 95,
  },
  {
    name: "Crystal Tundra",
    description:
      "An endless frozen expanse to the north. Towering ice spires catch the moonlight, and the ground sparkles with crystalline frost.",
    labelX: 0, labelZ: 320,
  },
  {
    name: "Blasted Suarezlands",
    description:
      "The volcanic east lands. Rivers of lava carve through obsidian fields and the air shimmers with scorching heat. Fire elementals and magma golems roam the jagged terrain.",
    labelX: 320, labelZ: 0,
  },
  {
    name: "Moin Swamps",
    description:
      "Sprawling southern swamplands, shrouded in perpetual mist. Bioluminescent fungi illuminate murky waters and the air hums with strange life. Ancient secrets lie submerged in the bog.",
    labelX: 0, labelZ: -320,
  },
  {
    name: "Malaka Area",
    description:
      "Sun-drenched plains and Mediterranean coastline to the southwest. Warm breezes carry the scent of wildflowers and sea salt.",
    labelX: -330, labelZ: -110,
  },
  {
    name: "Tanis Desert",
    description:
      "Rolling dunes and wind-carved ridges to the northwest. Pale sand stretches to the horizon under a relentless sun.",
    labelX: -230, labelZ: 230,
  },
];

const CENTER_RADIUS = 95; // matches Makaleta Strande locale disc

/** Pure zone lookup — mirrors server/src/world/zones.py get_zone. */
export function getZoneAt(x: number, z: number): string {
  for (const disc of LOCALE_DISCS) {
    const dx = x - disc.x;
    const dz = z - disc.z;
    if (dx * dx + dz * dz < disc.radius * disc.radius) {
      return disc.name;
    }
  }
  if (x * x + z * z < CENTER_RADIUS * CENTER_RADIUS) {
    return "Makaleta Strande";
  }
  return BIOME_ZONE_NAMES[getDominantBiome(x, z)];
}

export class ZoneTracker {
  private currentZone = "";
  onZoneChange?: (zoneName: string, description: string) => void;

  getCurrentZone(): string {
    return this.currentZone;
  }

  /**
   * Check the player's position against zone boundaries.
   * Fires `onZoneChange` when the player enters a new zone.
   */
  update(playerX: number, playerZ: number): void {
    const zone = getZoneAt(playerX, playerZ);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      const desc = this.getDescription(zone);
      this.onZoneChange?.(zone, desc);
    }
  }

  /**
   * Force a zone override — used for dungeon interiors and similar
   * situations where the player isn't on the overworld grid.
   */
  forceZone(name: string, description: string): void {
    this.currentZone = name;
    this.onZoneChange?.(name, description);
  }

  private getDescription(name: string): string {
    for (const zone of ZONES) {
      if (zone.name === name) {
        return zone.description;
      }
    }
    return "An uncharted stretch of land.";
  }
}
