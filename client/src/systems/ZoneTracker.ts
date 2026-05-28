/**
 * Tracks the player's current zone based on world coordinates.
 *
 * Mirrors the zones from server/src/world/zones.py exactly.
 * Zones are checked from smallest area to largest so the most-specific zone
 * always wins — this matches the server's ZONES.sort(key=_zone_area) logic.
 *
 * Boundary semantics:
 * - All zones except the last use exclusive max bounds (< max).
 * - The final catch-all zone uses inclusive max bounds (<= max).
 */

export interface ZoneData {
  name: string;
  description: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Mirror of server/src/world/zones.py ZONES list.
 *
 * Coordinate notes:
 * - Blasted Suarezlands: covers the mage district centred at (-140, -245)
 *   with outerRadius 74 → zone x ∈ [-220,-60], z ∈ [-325,-160].
 * - Fort Malaka: broader city zone containing the mage district sub-zone.
 * - All others remain unchanged.
 *
 * This array is sorted by ascending finite area at module load to match
 * the server's automatic sort order (see getZone below).
 */
export const ZONES: ZoneData[] = [
  {
    name: "Blasted Suarezlands",
    description: "The mage district of Fort Malaka — crackling with arcane energy. Rogue spellcasters and eccentric wizards fill the streets between glowing pylons and runic circles.",
    // Encompasses mountain (center -140, -245; outerRadius 74) + surrounding mage structures.
    minX: -220, maxX: -60, minZ: -325, maxZ: -160,
  },
  {
    name: "Fort Malaka",
    description: "A fortified Mediterranean city to the south, built on ancient ley lines. White-walled buildings, palm-lined promenades, and the golden Playa de la Malagueta stretch along its southern shore.",
    minX: -150, maxX: 150, minZ: -400, maxZ: -80,
  },
  {
    name: "Elders' Village",
    description: "A peaceful village at the heart of the world, where wise elders share ancient knowledge.",
    minX: -120, maxX: 120, minZ: -80, maxZ: 120,
  },
  {
    name: "Dark Forest",
    description: "A foreboding forest to the north, thick with shadows and strange whispers.",
    minX: -200, maxX: 200, minZ: 120, maxZ: 400,
  },
  {
    name: "Ember Peaks",
    description: "Volcanic mountains to the east, glowing with molten rivers and fire spirits.",
    minX: 120, maxX: 400, minZ: -200, maxZ: 200,
  },
  {
    name: "Crystal Lake",
    description: "A serene lake to the west, its waters shimmer with magical energy.",
    minX: -400, maxX: -120, minZ: -200, maxZ: 200,
  },
  {
    name: "Ember Wastes",
    description: "A vast volcanic wasteland stretching to the east. Rivers of lava carve through obsidian fields, and the air shimmers with scorching heat.",
    minX: 400, maxX: 99999, minZ: -99999, maxZ: 99999,
  },
  {
    name: "Crystal Tundra",
    description: "An endless frozen expanse to the north. Towering ice spires catch the moonlight, and the ground sparkles with crystalline frost.",
    minX: -99999, maxX: 99999, minZ: 400, maxZ: 99999,
  },
  {
    name: "Twilight Marsh",
    description: "A sprawling swampland to the south, shrouded in perpetual mist. Bioluminescent fungi illuminate murky waters, and the air hums with strange life.",
    minX: -99999, maxX: 99999, minZ: -99999, maxZ: -400,
  },
  {
    name: "Sunlit Meadows",
    description: "Rolling golden grasslands extending westward to the horizon. Warm breezes carry the scent of wildflowers, and gentle creatures graze beneath a sky touched by eternal sunset.",
    minX: -99999, maxX: -400, minZ: -99999, maxZ: 99999,
  },
  {
    name: "Teldrassil Wilds",
    description: "The ancient forest surrounding the Elders' Village. Massive trees draped with glowing vines tower above a carpet of luminescent mushrooms. Wisps drift between the trunks.",
    minX: -400, maxX: 400, minZ: -400, maxZ: 400,
  },
];

/** Finite area of a zone rectangle (capped at ±9999 to handle sentinel bounds). */
function zoneArea(z: ZoneData): number {
  const w = Math.min(z.maxX, 9999) - Math.max(z.minX, -9999);
  const h = Math.min(z.maxZ, 9999) - Math.max(z.minZ, -9999);
  return Math.max(0, w) * Math.max(0, h);
}

// Sort ascending by area so the most-specific zone is checked first — mirrors
// the server-side ZONES.sort(key=_zone_area) call in zones.py.
ZONES.sort((a, b) => zoneArea(a) - zoneArea(b));

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
    const zone = this.getZone(playerX, playerZ);
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

  private getZone(x: number, z: number): string {
    const lastIndex = ZONES.length - 1;
    for (let i = 0; i < ZONES.length; i++) {
      const zone = ZONES[i]!;
      // Exclusive upper bounds on all zones except the final catch-all so that
      // a coordinate on a shared edge belongs to the smaller zone only.
      const inBounds = i < lastIndex
        ? (x >= zone.minX && x < zone.maxX && z >= zone.minZ && z < zone.maxZ)
        : (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ);
      if (inBounds) {
        return zone.name;
      }
    }
    return "Wilderness";
  }

  private getDescription(name: string): string {
    for (const zone of ZONES) {
      if (zone.name === name) {
        return zone.description;
      }
    }
    if (name === "Wilderness") {
      return "A windswept desert of cacti, pale sand, and lonely stones where the map falls away.";
    }
    return "An uncharted stretch of land.";
  }
}
