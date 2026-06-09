import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh, hasMesh } from '../../core/MeshRegistry';
import { finishCharacter } from '../individual/_LowPolyKit';
import {
  type CreaturePalette,
  buildWraith, buildArachnid, buildSerpent, buildQuadruped,
  buildGolem, buildElemental, buildTreant, buildWasp, buildLurker,
} from './_CreatureKit';

/**
 * Cool, biome-themed skins for every procedurally-spawned monster.
 *
 * ProceduralPopulator spawns monsters with `appearance.mesh =
 * npc_creature_<def.id>`; the appearance resolver picks that mesh by id
 * (Priority 1). Any monster id without a registered creature mesh falls back to
 * the keyword-inferred procedural placeholder — so this list can grow freely.
 *
 * Each entry pairs a builder family with a palette tuned to the creature's
 * biome (forest, volcanic, tundra, swamp, fields, desert).
 */
type Builder = (g: THREE.Group, p: CreaturePalette) => void;

interface CreatureSpec {
  id: string;
  build: Builder;
  palette: CreaturePalette;
}

function spec(id: string, build: Builder, body: number, body2: number, accent: number, eye: number): CreatureSpec {
  return { id, build, palette: { body, body2, accent, eye } };
}

const wraith = buildWraith;
const golem = buildGolem;
const arachnid = buildArachnid;
const elemental = buildElemental;
const wasp = buildWasp;
const treant = buildTreant;
const serpent = buildSerpent;

// Family wrappers that need options.
const lurker = buildLurker;
const sentinel: Builder = (g, p) => buildGolem(g, p, { sentinel: true });
const scorpion: Builder = (g, p) => buildArachnid(g, p, { tail: true, claws: true, legs: 8 });
const hound: Builder = (g, p) => buildQuadruped(g, p, { mane: true });
const boar: Builder = (g, p) => buildQuadruped(g, p, { tusks: true });

const CREATURES: CreatureSpec[] = [
  // ── Teldrassil (moonlit forest) ──
  spec('wraith', wraith, 0x24382c, 0x1a2a20, 0x6fffa0, 0x9effa0),
  spec('spider', arachnid, 0x352f48, 0x2a2438, 0x8a5aff, 0xbfa0ff),
  spec('sentinel', sentinel, 0x4a5a4a, 0x3a4a3a, 0x88ffcc, 0x88ffcc),
  spec('treant', treant, 0x5a4326, 0x3f7a3a, 0xffd24a, 0xffd24a),

  // ── Blasted Suarezlands (volcanic) ──
  spec('lava_hound', hound, 0x241410, 0x140a08, 0xff5a1e, 0xff8a3a),
  spec('obs_golem', golem, 0x1c1c22, 0x12121a, 0xff4400, 0xff6a2a),
  spec('fire_sprite', elemental, 0x5a2410, 0x8a3a14, 0xff6a1e, 0xff9a3a),
  spec('ash_crawler', arachnid, 0x4a3f38, 0x352e28, 0xff7a3a, 0xff9a4a),

  // ── Crystal Tundra (ice) ──
  spec('frost_wraith', wraith, 0x2a3b55, 0x1e2b40, 0x9fe8ff, 0x9fe8ff),
  spec('glacial_golem', golem, 0x6fa8c8, 0x4f88a8, 0xbff0ff, 0xbff0ff),
  spec('ice_wolf', hound, 0xbfd8e8, 0x9fb8d0, 0x8fd8ff, 0x8fd8ff),
  spec('snow_stalker', arachnid, 0xd8e4ee, 0xb8c8d8, 0x6fb0ff, 0x6fb0ff),

  // ── Moin Swamps ──
  spec('bog_lurker', golem, 0x3a4a30, 0x2a3a24, 0xaaff44, 0xaaff44),
  spec('shadow_snake', serpent, 0x2a2a38, 0x3a3a52, 0x8a5aff, 0x8a5aff),
  spec('swamp_troll', golem, 0x4a5a3a, 0x3a4a2c, 0xccff66, 0xccff66),
  spec('marsh_wisp', elemental, 0x1f4a3a, 0x2a6a4a, 0x6affc0, 0x6affc0),

  // ── Malaka Area (mediterranean fields) ──
  spec('stone_boar', boar, 0x8a7a5a, 0x6a5a40, 0xff5a3a, 0xff7a4a),
  spec('sunstone_golem', golem, 0xc89a4a, 0xa87a30, 0xffcf6a, 0xffcf6a),
  spec('giant_wasp', wasp, 0xd8b020, 0x201c10, 0xff4a2a, 0xff3a2a),
  spec('field_stalker', arachnid, 0x7a6a3a, 0x5a4a28, 0xff8a3a, 0xffaa4a),

  // ── Tanis Desert ──
  spec('sand_wraith', wraith, 0xc8a86a, 0xa88850, 0xffd86a, 0xffd86a),
  spec('dune_crawler', arachnid, 0xc8a060, 0xa88048, 0xff9a3a, 0xffba5a),
  spec('desert_golem', golem, 0xc89a5a, 0xa87a40, 0xffce7a, 0xffce7a),
  spec('scorpion', scorpion, 0x8a5a2a, 0x6a401c, 0xff5a3a, 0xff7a3a),
];

// ── Fixed manifest monsters ───────────────────────────────────────────────────
// Hand-placed monster/neutral NPCs from the world manifest (one per zone group).
// They resolve via Priority 2 (`npc_individual_<id>`), so each gets a real
// biome-themed skin instead of the generic inferred placeholder. Named humanoid
// bosses (Flame Cultist, Ice Shaman, Bog Witch, Wandering Knight, Tundra Yeti,
// Outlaw Scout) have their own bespoke mesh files and are NOT listed here.
const FIXED_MONSTERS: CreatureSpec[] = [
  // teldrassil_central
  spec('wraith_01', wraith, 0x2e4034, 0x203026, 0x8fffb0, 0xb8ffd0),  // Sylvara — brighter
  spec('wraith_02', wraith, 0x24382c, 0x1a2a20, 0x6fffa0, 0x9effa0),
  spec('moon_spider_01', arachnid, 0x352f48, 0x2a2438, 0x8a5aff, 0xbfa0ff),
  // malaka_wilderness
  spec('treant_01', treant, 0x5a4326, 0x3f7a3a, 0xffd24a, 0xffd24a),
  spec('wolf_01', hound, 0x5a5048, 0x40382f, 0xd8c8a0, 0xffe27a),
  spec('wolf_02', hound, 0x5a5048, 0x40382f, 0xd8c8a0, 0xffe27a),
  // ember_wastes
  spec('lava_hound_01', hound, 0x241410, 0x140a08, 0xff5a1e, 0xff8a3a),
  spec('lava_hound_02', hound, 0x241410, 0x140a08, 0xff5a1e, 0xff8a3a),
  spec('lava_hound_03', hound, 0x241410, 0x140a08, 0xff5a1e, 0xff8a3a),
  spec('obsidian_golem_01', sentinel, 0x1c1c22, 0x12121a, 0xff4400, 0xff6a2a),
  spec('fire_sprite_01', elemental, 0x5a2410, 0x8a3a14, 0xff6a1e, 0xff9a3a),
  spec('fire_sprite_02', elemental, 0x5a2410, 0x8a3a14, 0xff6a1e, 0xff9a3a),
  // crystal_tundra
  spec('frost_wraith_01', wraith, 0x2a3b55, 0x1e2b40, 0x9fe8ff, 0x9fe8ff),
  spec('frost_wraith_02', wraith, 0x2a3b55, 0x1e2b40, 0x9fe8ff, 0x9fe8ff),
  spec('ice_wolf_01', hound, 0xbfd8e8, 0x9fb8d0, 0x8fd8ff, 0x8fd8ff),
  spec('ice_wolf_02', hound, 0xbfd8e8, 0x9fb8d0, 0x8fd8ff, 0x8fd8ff),
  spec('glacial_golem_01', golem, 0x6fa8c8, 0x4f88a8, 0xbff0ff, 0xbff0ff),
  // twilight_marsh
  spec('bog_lurker_01', lurker, 0x3a4a30, 0x6a7a4a, 0xaaff44, 0xaaff44),
  spec('bog_lurker_02', lurker, 0x3a4a30, 0x6a7a4a, 0xaaff44, 0xaaff44),
  spec('shadow_serpent_01', serpent, 0x2a2a38, 0x3a3a52, 0x8a5aff, 0x8a5aff),
  spec('shadow_serpent_02', serpent, 0x2a2a38, 0x3a3a52, 0x8a5aff, 0x8a5aff),
  spec('swamp_troll_01', golem, 0x4a5a3a, 0x3a4a2c, 0xccff66, 0xccff66),
  spec('will_wisp_01', elemental, 0x1f4a3a, 0x2a6a4a, 0x9affd0, 0x9affd0),
  // sunlit_meadows
  spec('stone_boar_01', boar, 0x8a7a5a, 0x6a5a40, 0xff5a3a, 0xff7a4a),
  spec('stone_boar_02', boar, 0x8a7a5a, 0x6a5a40, 0xff5a3a, 0xff7a4a),
  spec('stone_boar_03', boar, 0x8a7a5a, 0x6a5a40, 0xff5a3a, 0xff7a4a),
  spec('giant_wasp_01', wasp, 0xd8b020, 0x201c10, 0xff4a2a, 0xff3a2a),
  spec('giant_wasp_02', wasp, 0xd8b020, 0x201c10, 0xff4a2a, 0xff3a2a),
  spec('sunstone_golem_01', golem, 0xc89a4a, 0xa87a30, 0xffcf6a, 0xffcf6a),
];

function makeCreatureClass(type: string, s: CreatureSpec): void {
  if (hasMesh(type)) return;
  const CreatureClass = class extends Mesh {
    static readonly type = type;
    static readonly category = 'npc' as const;

    build(ctx: BuildContext): THREE.Object3D {
      const group = new THREE.Group();
      if (ctx.label) group.name = ctx.label;
      s.build(group, s.palette);
      finishCharacter(group);
      group.position.copy(ctx.position);
      group.scale.setScalar(ctx.scale);
      return group;
    }
  };
  Object.defineProperty(CreatureClass, 'type', { value: type });
  Object.defineProperty(CreatureClass, 'category', { value: 'npc' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerMesh(CreatureClass as any);
}

export function registerCreatureMeshes(): void {
  // Procedural-spawn skins (keyed by monster def id).
  for (const s of CREATURES) makeCreatureClass(`npc_creature_${s.id}`, s);
  // Fixed manifest monster skins (keyed by NPC id).
  for (const s of FIXED_MONSTERS) makeCreatureClass(`npc_individual_${s.id}`, s);
}

// Side effect: register all creature meshes on import.
registerCreatureMeshes();
