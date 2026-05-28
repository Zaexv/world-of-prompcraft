import * as THREE from 'three';

const loader = new THREE.TextureLoader();

function rep(url: string): THREE.Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Terrain: aerial_grass_rock (Poly Haven CC0)
const terrainNor = rep('/textures/terrain_nor.jpg');
const terrainRough = rep('/textures/terrain_rough.jpg');

// Character armor/fabric: brown_leather (Poly Haven CC0)
const leatherNor = rep('/textures/leather_nor.jpg');
const leatherRough = rep('/textures/leather_rough.jpg');

// Building stone: cobblestone_floor_01 (Poly Haven CC0) — 2 tiles per UV unit
const stoneNor = rep('/textures/stone_nor.jpg');
const stoneRough = rep('/textures/stone_rough.jpg');
stoneNor.repeat.set(2, 2);
stoneRough.repeat.set(2, 2);

// Skin: procedural pore-noise normal map — tiled fine over the face
const skinNor = makeSkinNor(256);

/** Add detail normal + roughness maps to the shared terrain material. */
export function applyTerrainPBR(m: THREE.MeshStandardMaterial): void {
  m.normalMap = terrainNor;
  m.normalScale.set(0.6, 0.6);
  m.roughnessMap = terrainRough;
  m.needsUpdate = true;
}

/**
 * Add leather/fabric detail to every non-emissive, non-transparent mesh in a
 * character group (body, arms, legs — skips eyes, gems, cloaks).
 * The 'head' mesh gets a skin normal map instead of leather.
 */
export function applyCharacterPBR(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = child.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;
    if (mat.transparent) return;
    if (mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.02) return;

    if (child.name === 'head') {
      applySkinPBR(mat);
    } else {
      mat.normalMap = leatherNor;
      mat.normalScale.set(0.35, 0.35);
      mat.roughnessMap = leatherRough;
      mat.needsUpdate = true;
    }
  });
}

/** Add cobblestone detail to a stone building material. */
export function applyStonePBR(m: THREE.MeshStandardMaterial): void {
  m.normalMap = stoneNor;
  m.normalScale.set(0.5, 0.5);
  m.roughnessMap = stoneRough;
  m.needsUpdate = true;
}

/** Apply a subtle pore-noise normal map to a skin (face/head) material. */
function applySkinPBR(m: THREE.MeshStandardMaterial): void {
  m.normalMap = skinNor;
  m.normalScale.set(0.12, 0.12); // very subtle — skin is smooth
  m.roughness = 0.82;            // matte, no specular sheen
  m.needsUpdate = true;
}

/**
 * Procedural skin normal map: flat base (128,128,255) with tiny radial
 * indentations scattered across to simulate pores. No file download required.
 */
function makeSkinNor(size: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Flat normal = pointing straight up in tangent space
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  // Scatter tiny pore indentations (inward normals = darker blue-shifted dots)
  const count = Math.floor(size * size * 0.018);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.7 + Math.random() * 1.6;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0,   'rgba(85,85,210,0.55)');
    grad.addColorStop(0.5, 'rgba(110,110,235,0.20)');
    grad.addColorStop(1,   'rgba(128,128,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4); // tile finely so pores read at face scale
  tex.needsUpdate = true;
  return tex;
}
