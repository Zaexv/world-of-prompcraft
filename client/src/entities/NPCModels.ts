/**
 * Maps NPC IDs to GLTF model paths.
 * Place matching GLB files under client/public/models/npcs/ (Quaternius CC0 pack or similar).
 * If a file is missing the NPC falls back to the procedural mesh automatically.
 */
export const NPC_MODEL_MAP: Record<string, string> = {
  dragon_01:   '/models/npcs/dragon.glb',
  merchant_01: '/models/npcs/merchant.glb',
  guard_01:    '/models/npcs/warrior.glb',
  healer_01:   '/models/npcs/healer.glb',
  sage_01:     '/models/npcs/mage.glb',
  eltito_01:   '/models/npcs/casual.glb',
  mage_01:     '/models/npcs/mage.glb',
  mage_02:     '/models/npcs/pyromancer.glb',
  mage_03:     '/models/npcs/cryomancer.glb',
};

/** Maps internal animation names to GLTF clip names from the Quaternius pack. */
export const GLTF_CLIP_MAP: Record<string, string> = {
  idle:   'Idle',
  walk:   'Walk',
  attack: 'Attack',
  emote:  'Wave',
};
