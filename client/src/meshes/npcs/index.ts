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
  'oracle'
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

function registerNPCStyle(type: string, style: NPCPlaceholderStyle, label?: string) {
  const NPCClass = class extends Mesh {
    static readonly type = type;
    static readonly category = 'npc' as const;

    build(ctx: BuildContext): THREE.Object3D {
      const group = new THREE.Group();
      const appearance = getPlaceholderAppearance(style);
      buildProceduralMesh(group, appearance, style);
      group.position.copy(ctx.position);
      group.scale.setScalar(ctx.scale);
      if (label) group.name = label;
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
