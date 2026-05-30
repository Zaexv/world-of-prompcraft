/**
 * NPCModels — Procedural style resolution.
 * All models are now rendered as procedural meshes; GLTF support has been removed.
 */

export type NPCPlaceholderStyle =
  | 'civilian'
  | 'merchant'
  | 'guard'
  | 'healer'
  | 'sage'
  | 'mage'
  | 'pyromancer'
  | 'cryomancer'
  | 'dragon'
  | 'monster'
  | 'orc'
  | 'undead' 
  | 'oracle';

interface NPCPlaceholderStyleRule {
  keywords: readonly string[];
  style: NPCPlaceholderStyle;
}

const NPC_PLACEHOLDER_STYLE_RULES: NPCPlaceholderStyleRule[] = [
  { keywords: ['dragon', 'wyrm', 'beast', 'boss'], style: 'dragon' },
  // undead before monster to prevent wraith/ghost from matching monster first
  { keywords: ['undead', 'ghost', 'wraith', 'skeleton', 'zombie', 'ghoul'], style: 'undead' },
  { keywords: ['monster', 'spider', 'wolf', 'treant', 'golem', 'bat', 'hydra', 'elemental', 'crawler', 'stalker', 'revenant', 'abomination', 'slime', 'ogre', 'brute', 'demon'], style: 'monster' },
  { keywords: ['merchant', 'trader', 'vendor', 'shop', 'citizen', 'village', 'villager', 'elder', 'artisan', 'baker', 'farmer', 'herbalist', 'fisher'], style: 'merchant' },
  { keywords: ['rogue', 'thief', 'assassin', 'pirate', 'bandit', 'outlaw', 'brigand'], style: 'guard' },
  { keywords: ['guard', 'sentinel', 'warden', 'captain', 'soldier', 'scout', 'knight', 'moonguard'], style: 'guard' },
  { keywords: ['orc', 'raider', 'berserker', 'war', 'fighter'], style: 'orc' },
  { keywords: ['healer', 'priest', 'priestess', 'cleric', 'nurse'], style: 'healer' },
  { keywords: ['elf', 'elven', 'moonkin', 'nightsong', 'dryad'], style: 'healer' },
  { keywords: ['pyromancer', 'fire', 'ember', 'flame', 'burn'], style: 'pyromancer' },
  { keywords: ['cryomancer', 'frost', 'ice', 'winter', 'glacier'], style: 'cryomancer' },
  { keywords: ['sage', 'druid', 'seer', 'scholar', 'witch', 'shaman', 'mystic'], style: 'sage' },
  { keywords: ['oracle'], style: 'oracle' },
  { keywords: ['mage', 'wizard', 'archmage'], style: 'mage' },
];

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
      return 'mage';
    case 'mage_02':
      return 'pyromancer';
    case 'mage_03':
      return 'cryomancer';
    case "nireg_jenkins":
      return "oracle";
    case "eltito_01":
      return 'orc';
    default:
      return null;
  }
}
