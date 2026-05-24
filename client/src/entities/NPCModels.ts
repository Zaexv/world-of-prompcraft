/**
 * Resolves NPC GLTF model paths from the NPC type name, with per-ID overrides.
 * Place matching GLB files under client/public/models/npcs/ (Quaternius CC0 pack or similar).
 * If a file is missing the NPC falls back to the procedural mesh automatically.
 */
export const NPC_MODEL_MAP: Record<string, string> = {
  dragon_01: '/models/npcs/dragon.glb',
  merchant_01: '/models/npcs/merchant.glb',
  guard_01: '/models/npcs/warrior.glb',
  healer_01: '/models/npcs/healer.glb',
  sage_01: '/models/npcs/mage.glb',
  eltito_01: '/models/npcs/casual.glb',
  mage_01: '/models/npcs/mage.glb',
  mage_02: '/models/npcs/pyromancer.glb',
  mage_03: '/models/npcs/cryomancer.glb',
};

interface NPCModelRule {
  keywords: readonly string[];
  path: string;
}

export type NPCPlaceholderStyle =
  | 'civilian'
  | 'merchant'
  | 'guard'
  | 'healer'
  | 'sage'
  | 'mage'
  | 'dragon'
  | 'monster'
  | 'orc'
  | 'undead';

const NPC_TYPE_MODEL_RULES: NPCModelRule[] = [
  { keywords: ['dragon', 'wyrm', 'beast', 'boss'], path: '/models/npcs/dragon.glb' },
  { keywords: ['monster', 'spider', 'wolf', 'treant', 'golem', 'bat', 'hydra', 'elemental', 'crawler', 'stalker', 'revenant', 'wraith', 'abomination', 'slime', 'ogre', 'brute', 'demon'], path: '/models/npcs/monster.glb' },
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
  idle: 'Idle',
  walk: 'Walk',
  attack: 'Attack',
  emote: 'Wave',
};

export function getNPCModelPath(
  id: string,
  name: string,
  behavior?: 'friendly' | 'neutral' | 'hostile',
): string | null {
  const override = NPC_MODEL_MAP[id];
  if (override) return override;

  const normalizedName = name.toLowerCase();
  for (const rule of NPC_TYPE_MODEL_RULES) {
    if (rule.keywords.some((keyword) => normalizedName.includes(keyword))) {
      return rule.path;
    }
  }

  if (behavior === 'hostile') {
    return '/models/npcs/monster.glb';
  }

  return NPC_FALLBACK_MODELS[hashString(`${id}|${name}`) % NPC_FALLBACK_MODELS.length] ?? null;
}

export function getNPCPlaceholderStyle(
  id: string,
  name: string,
  behavior?: 'friendly' | 'neutral' | 'hostile',
): NPCPlaceholderStyle {
  const override = getPlaceholderStyleFromId(id);
  if (override) return override;

  const normalizedName = name.toLowerCase();
  for (const rule of NPC_PLACEHOLDER_STYLE_RULES) {
    if (rule.keywords.some((keyword) => normalizedName.includes(keyword))) {
      return rule.style;
    }
  }

  if (behavior === 'hostile') {
    return 'monster';
  }

  return 'civilian';
}

interface NPCPlaceholderStyleRule {
  keywords: readonly string[];
  style: NPCPlaceholderStyle;
}

const NPC_PLACEHOLDER_STYLE_RULES: NPCPlaceholderStyleRule[] = [
  { keywords: ['dragon', 'wyrm', 'beast', 'boss'], style: 'dragon' },
  { keywords: ['monster', 'spider', 'wolf', 'treant', 'golem', 'bat', 'hydra', 'elemental', 'crawler', 'stalker', 'revenant', 'wraith', 'abomination', 'slime', 'ogre', 'brute', 'demon'], style: 'monster' },
  { keywords: ['merchant', 'trader', 'vendor', 'shop', 'citizen', 'village', 'villager', 'elder', 'artisan', 'baker', 'farmer', 'herbalist', 'fisher'], style: 'merchant' },
  { keywords: ['guard', 'sentinel', 'warden', 'captain', 'soldier', 'scout', 'knight', 'moonguard'], style: 'guard' },
  { keywords: ['healer', 'priest', 'priestess', 'cleric', 'nurse'], style: 'healer' },
  { keywords: ['sage', 'druid', 'seer', 'scholar'], style: 'sage' },
  { keywords: ['mage', 'wizard', 'archmage'], style: 'mage' },
  { keywords: ['pyromancer', 'fire', 'ember', 'flame', 'burn'], style: 'mage' },
  { keywords: ['cryomancer', 'frost', 'ice', 'winter', 'glacier'], style: 'mage' },
  { keywords: ['orc', 'raider', 'berserker', 'war', 'fighter'], style: 'orc' },
  { keywords: ['undead', 'ghost', 'wraith', 'skeleton', 'zombie', 'ghoul'], style: 'undead' },
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getPlaceholderStyleFromId(id: string): NPCPlaceholderStyle | null {
  switch (id) {
    case 'dragon_01':
      return 'dragon';
    case 'monster_01':
      return 'monster';
    case 'merchant_01':
      return 'merchant';
    case 'guard_01':
      return 'guard';
    case 'healer_01':
      return 'healer';
    case 'sage_01':
      return 'sage';
    case 'mage_01':
    case 'mage_02':
    case 'mage_03':
      return 'mage';
    case 'eltito_01':
      return 'orc';
    default:
      return null;
  }
}
