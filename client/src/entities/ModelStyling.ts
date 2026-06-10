import * as THREE from 'three';

export interface OutlineOptions {
  color?: number;
  scale?: number;
  opacity?: number;
  includeNames?: readonly string[];
}

/**
 * Adds a lightweight outline shell to selected meshes so low-poly characters
 * keep a readable silhouette against the dark world background.
 */
export function addOutlineShell(root: THREE.Object3D, options: OutlineOptions = {}): void {
  const color = options.color ?? 0x06080d;
  const scale = options.scale ?? 1.045;
  const opacity = options.opacity ?? 1;
  const includeNames = options.includeNames ?? null;
  const meshes: THREE.Mesh[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (includeNames && !includeNames.includes(child.name)) return;
    meshes.push(child);
  });

  // One material shared by all shells in this call: identical params anyway, and
  // sharing lets the NPC rig merge collapse every outline shell into one draw.
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
  });
  for (const mesh of meshes) {
    const outline = new THREE.Mesh(mesh.geometry.clone(), outlineMaterial);
    outline.name = `${mesh.name || 'mesh'}_outline`;
    outline.position.set(0, 0, 0);
    outline.rotation.set(0, 0, 0);
    outline.quaternion.identity();
    outline.scale.setScalar(scale);
    outline.renderOrder = -1;
    outline.castShadow = false;
    outline.receiveShadow = false;
    mesh.add(outline);
  }
}
