import * as THREE from 'three';

export interface DebugInfo {
  type: string;       // mesh type string, e.g. "malaka_church"
  category: string;   // "building" | "prop" | "vegetation" | "encounter" | "npc"
  label?: string;     // optional authored label from world manifest
  zone?: string;      // biome/zone name at spawn time, e.g. "Teldrassil"
}

/** Stamp debug metadata on a placed object's root group. One call per root. */
export function tagDebugInfo(obj: THREE.Object3D, info: DebugInfo): void {
  obj.userData.debugInfo = info;
}
