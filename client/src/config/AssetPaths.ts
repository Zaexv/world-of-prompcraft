/**
 * Centralized asset paths and URIs.
 * All asset references in one place for easy updates.
 */

export const AssetPaths = {
  // Textures
  textures: {
    terrain: {
      grass: '/assets/textures/terrain/grass.jpg',
      sand: '/assets/textures/terrain/sand.jpg',
      rock: '/assets/textures/terrain/rock.jpg',
      snow: '/assets/textures/terrain/snow.jpg',
      heightmap: '/assets/textures/terrain/heightmap.jpg',
      normal: '/assets/textures/terrain/normal.jpg',
    },
    water: '/assets/textures/water/ocean.jpg',
    skybox: {
      px: '/assets/textures/skybox/px.jpg',
      nx: '/assets/textures/skybox/nx.jpg',
      py: '/assets/textures/skybox/py.jpg',
      ny: '/assets/textures/skybox/ny.jpg',
      pz: '/assets/textures/skybox/pz.jpg',
      nz: '/assets/textures/skybox/nz.jpg',
    },
    ui: {
      button: '/assets/textures/ui/button.png',
      panel: '/assets/textures/ui/panel.png',
      icon: '/assets/textures/ui/icon.png',
    },
  },

  // Models
  models: {
    player: '/assets/models/player.glb',
    npc: {
      base: '/assets/models/npc/base.glb',
      mage: '/assets/models/npc/mage.glb',
      warrior: '/assets/models/npc/warrior.glb',
      rogue: '/assets/models/npc/rogue.glb',
    },
    buildings: {
      house: '/assets/models/buildings/house.glb',
      fort: '/assets/models/buildings/fort.glb',
      shop: '/assets/models/buildings/shop.glb',
      tavern: '/assets/models/buildings/tavern.glb',
    },
    vegetation: {
      tree: '/assets/models/vegetation/tree.glb',
      grass: '/assets/models/vegetation/grass.glb',
      flower: '/assets/models/vegetation/flower.glb',
    },
    effects: {
      particle: '/assets/models/effects/particle.glb',
      explosion: '/assets/models/effects/explosion.glb',
    },
  },

  // Audio
  audio: {
    ambient: '/assets/audio/ambient.mp3',
    ui: {
      click: '/assets/audio/ui/click.mp3',
      hover: '/assets/audio/ui/hover.mp3',
      alert: '/assets/audio/ui/alert.mp3',
    },
    combat: {
      hit: '/assets/audio/combat/hit.mp3',
      miss: '/assets/audio/combat/miss.mp3',
      spell: '/assets/audio/combat/spell.mp3',
    },
  },

  // Data Files
  data: {
    npcDefinitions: '/data/npc-definitions.json',
    zones: '/data/zones.json',
    items: '/data/items.json',
    lore: '/data/lore.json',
  },
} as const;

export type AssetPathsType = typeof AssetPaths;
