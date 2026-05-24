/**
 * Resolves NPC GLTF model paths from the NPC type name, with per-ID overrides.
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

interface NPCModelRule {
  keywords: readonly string[];
  path: string;
}

const NPC_TYPE_MODEL_RULES: NPCModelRule[] = [
  { keywords: ['dragon', 'wyrm', 'beast', 'boss'], path: '/models/npcs/dragon.glb' },
  { keywords: ['merchant', 'trader', 'vendor', 'shop', 'citizen', 'village', 'villager', 'elder', 'artisan', 'baker', 'farmer', 'herbalist', 'fisher'], path: '/models/npcs/casual.glb' },
  { keywords: ['guard', 'sentinel', 'warden', 'captain', 'soldier', 'scout', 'knight', 'moonguard'], path: '/models/npcs/warrior.glb' },
  { keywords: ['healer', 'priest', 'priestess', 'cleric', 'nurse'], path: '/models/npcs/healer.glb' },
  { keywords: ['sage', 'mage', 'wizard', 'archmage', 'scholar', 'druid', 'seer'], path: '/models/npcs/mage.glb' },
  { keywords: ['pyromancer', 'fire', 'ember', 'flame', 'burn'], path: '/models/npcs/pyromancer.glb' },
  { keywords: ['cryomancer', 'frost', 'ice', 'winter', 'glacier'], path: '/models/npcs/cryomancer.glb' },
  { keywords: ['orc', 'raider', 'berserker', 'war', 'fighter'], path: '/models/npcs/warrior.glb' },
  { keywords: ['undead', 'ghost', 'wraith', 'skeleton', 'zombie', 'ghoul'], path: '/models/npcs/casual.glb' },
];

const NPC_FALLBACK_MODELS = [
  '/models/npcs/casual.glb',
  '/models/npcs/merchant.glb',
  '/models/npcs/warrior.glb',
  '/models/npcs/mage.glb',
];

/** Maps internal animation names to GLTF clip names from the Quaternius pack. */
export const GLTF_CLIP_MAP: Record<string, string> = {
  idle:   'Idle',
  walk:   'Walk',
  attack: 'Attack',
  emote:  'Wave',
};

export function getNPCModelPath(id: string, name: string): string | null {
  const override = NPC_MODEL_MAP[id];
  if (override) return override;

  const normalizedName = name.toLowerCase();
  for (const rule of NPC_TYPE_MODEL_RULES) {
    if (rule.keywords.some((keyword) => normalizedName.includes(keyword))) {
      return rule.path;
    }
  }

  return NPC_FALLBACK_MODELS[hashString(`${id}|${name}`) % NPC_FALLBACK_MODELS.length] ?? null;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
