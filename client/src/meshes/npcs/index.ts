import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { buildProceduralMesh, getPlaceholderAppearance } from '../../entities/NPCAppearance';
import { NPCPlaceholderStyle, getNPCPlaceholderStyle } from '../../entities/NPCModels';
import { hasMesh } from '../core/MeshRegistry';

// Import individual NPCs
import './individual/NiregJenkins';
import './individual/AureliaTrader';
import './individual/ElTito';
import './individual/Zaex';
// Fort Malaka individuals — hand-authored skins reflecting each NPC's character
import './individual/CaptainRolan';
import './individual/GateWarden';
import './individual/SisterConstanza';
import './individual/PabloFisherman';
import './individual/PacoChurrero';
import './individual/JuanPescador';
import './individual/GuardiaAbelardo';
import './individual/LuisaPatatera';
import './individual/SanchoBarriga';
import './individual/AlonsoQuijano';
import './individual/AmphitheatreManolos';
// Tutorial guide (starting area)
import './individual/TutorialMan';
// Named wilderness / biome characters (fixed manifest NPCs)
import './individual/OutlawScout';
import './individual/FlameCultist';
import './individual/IceShaman';
import './individual/BogWitch';
import './individual/WanderingKnight';
import './individual/TundraYeti';
// Biome-themed skins for procedurally-spawned monsters + fixed manifest monsters
import './creatures';
// Original blocky voxel skins, kept selectable via appearance.mesh = npc_individual_<id>_voxel
import './individual/NiregJenkinsVoxel';
import './individual/ElTitoVoxel';
import './individual/ZaexVoxel';

// We import the manifest to get individual NPCs
import manifest from '../../../../shared/data/world_manifest.json';

const STYLES: NPCPlaceholderStyle[] = [
  'civilian',
  'merchant',
  'guard',
  'healer',
  'sage',
  'mage',
  'pyromancer',
  'cryomancer',
  'dragon',
  'monster',
  'orc',
  'undead',
  'oracle',
  'spider',
  'wasp',
  'wolf',
  'golem',
  'boar',
];

export function registerNPCMeshes() {
  // 1. Register Generic Styles
  for (const style of STYLES) {
    const type = `npc_style_${style}`;
    if (!hasMesh(type)) {
      registerNPCStyle(type, style);
    }
  }

  // 2. Register Individual NPCs from Manifest
  const seenIds = new Set<string>();
  for (const zone of Object.values(manifest.zones)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const npcs = (zone as any).population?.npcs ?? [];
    for (const npc of npcs) {
      if (seenIds.has(npc.id)) continue;
      seenIds.add(npc.id);

      const type = `npc_individual_${npc.id}`;
      if (hasMesh(type)) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const style = getNPCPlaceholderStyle(npc.id, npc.identity.name, npc.identity.role as any);
      registerNPCStyle(type, style, npc.identity.name);
    }
  }
}

function registerNPCStyle(type: string, style: NPCPlaceholderStyle, _label?: string) {
  const NPCClass = class extends Mesh {
    static readonly type = type;
    static readonly category = 'npc' as const;

    build(ctx: BuildContext): THREE.Object3D {
      const group = new THREE.Group();
      // ctx.label carries the NPC id — used by buildProceduralMesh as the variation seed
      if (ctx.label) group.name = ctx.label;
      const appearance = getPlaceholderAppearance(style);
      buildProceduralMesh(group, appearance, style);
      group.position.copy(ctx.position);
      group.scale.setScalar(ctx.scale);
      return group;
    }
  };

  Object.defineProperty(NPCClass, 'type', { value: type });
  Object.defineProperty(NPCClass, 'category', { value: 'npc' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerMesh(NPCClass as any);
}

// Side effect: register all NPC meshes
registerNPCMeshes();
