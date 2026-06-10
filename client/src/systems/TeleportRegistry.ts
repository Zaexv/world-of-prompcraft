/**
 * TeleportRegistry — the single place that decides which landmark types are
 * fast-travel destinations shown on the world map.
 *
 * Modular by design (mirrors BiomeRegistry): the default destination types live
 * here, and any module can `registerTeleportType('my_type')` at load time to opt
 * a new landmark kind into fast-travel without touching WorldGenerator. A
 * landmark is also teleportable if it sets `visual.metadata.teleportable: true`.
 *
 * Props (palm trees, grass, lanterns, market stalls, fences, …) are intentionally
 * absent so the map stays a list of meaningful places, not clutter.
 */

const _teleportTypes = new Set<string>([
  // Generic landmark structures.
  'campfire', 'moonwell', 'altar', 'ruins', 'tower', 'portal_arch', 'pavilion',
  'runic_stone',
  // Biome / Málaga signature buildings worth travelling to.
  'mage_tower', 'malaka_tower', 'malaka_broken_church', 'malaka_broken_castle',
  'malaka_farm', 'biome_volcano',
]);

/** Register a landmark `type` as a fast-travel destination. Call at load time. */
export function registerTeleportType(type: string): void {
  _teleportTypes.add(type);
}

/** True if the landmark type is a fast-travel destination. */
export function isTeleportType(type: string): boolean {
  return _teleportTypes.has(type);
}

/** Snapshot of all registered destination types (for tests/introspection). */
export function teleportTypes(): string[] {
  return Array.from(_teleportTypes);
}

/**
 * Compute a fast-travel arrival point that lands the player CLEAR of a
 * structure's footprint instead of inside its mesh. Offsets the destination
 * toward world origin (the "approach" side) by the footprint radius plus a
 * margin. A landmark sitting exactly at origin steps south instead.
 */
export function safeArrivalXZ(
  x: number,
  z: number,
  safeRadius = 6,
): { x: number; z: number } {
  const clearance = safeRadius + 3;
  const len = Math.hypot(x, z);
  if (len <= 0.001) return { x, z: z + clearance };
  return { x: x - (x / len) * clearance, z: z - (z / len) * clearance };
}
