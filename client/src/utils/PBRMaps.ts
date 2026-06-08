import * as THREE from 'three';

const loader = new THREE.TextureLoader();

// 4× anisotropic filtering keeps tiled detail (terrain, stone, bark, roof tiles)
// crisp at the grazing angles the third-person camera constantly looks across,
// where plain trilinear mipmapping would otherwise smear it into a blur.
const ANISOTROPY = 8;

function rep(url: string): THREE.Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISOTROPY;
  return t;
}

// Terrain: aerial_grass_rock (Poly Haven CC0)
const terrainNor = rep('/textures/terrain_nor.jpg');
const terrainRough = rep('/textures/terrain_rough.jpg');

// Character armor/fabric: brown_leather (Poly Haven CC0)
const leatherNor = rep('/textures/leather_nor.jpg');
const leatherRough = rep('/textures/leather_rough.jpg');

// Character cloth: real scanned fabric maps (Poly Haven CC0) — normal + roughness
// per weave so robes/turbans/kilts read as actual cloth instead of leather:
// silk = crepe_satin (glossy sheen), velvet = velour_velvet (soft pile),
// wool = wool_boucle (chunky knit). Tiled fine since they cover small garments.
function fabric(url: string, rep1: number): THREE.Texture {
  const t = rep(url);
  t.repeat.set(rep1, rep1);
  return t;
}
const silkNor = fabric('/textures/silk_nor.jpg', 4);
const silkRough = fabric('/textures/silk_rough.jpg', 4);
const velvetNor = fabric('/textures/velvet_nor.jpg', 3);
const velvetRough = fabric('/textures/velvet_rough.jpg', 3);
const woolNor = fabric('/textures/wool_nor.jpg', 2);
const woolRough = fabric('/textures/wool_rough.jpg', 2);

// Building stone: cobblestone_floor_01 (Poly Haven CC0) — 2 tiles per UV unit
const stoneDiff = rep('/textures/stone_diff.jpg');
const stoneNor = rep('/textures/stone_nor.jpg');
const stoneRough = rep('/textures/stone_rough.jpg');
stoneDiff.colorSpace = THREE.SRGBColorSpace;
stoneDiff.repeat.set(2, 2);
stoneNor.repeat.set(2, 2);
stoneRough.repeat.set(2, 2);

// Malaka albedo maps (Poly Haven CC0): white plaster, terracotta tiles,
// cut limestone blocks, dark wood. Replace the old procedural canvas maps.
function diff(url: string, rx: number, ry: number): THREE.Texture {
  const t = rep(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(rx, ry);
  return t;
}
const malakaStuccoDiff = diff('/textures/stucco_diff.jpg', 3, 3);
const malakaRoofDiff = diff('/textures/roof_diff.jpg', 5, 5);
const malakaStoneDiff = diff('/textures/malaka_stone_diff.jpg', 4, 4);
const malakaWoodDiff = diff('/textures/wood_diff.jpg', 2, 2);

// Malaka normal maps (Poly Haven CC0), each from the SAME set as its albedo so
// the relief lines up with the diffuse detail: stucco=painted_plaster_wall,
// roof=roof_tiles_14, stone=medieval_blocks_02, wood=dark_wood. These replace the
// old procedural canvas normals. Repeats mirror the albedo repeats above.
function nor(url: string, rx: number, ry: number): THREE.Texture {
  const t = rep(url); // linear colour space — normals are not sRGB
  t.repeat.set(rx, ry);
  return t;
}
const malakaStuccoNor = nor('/textures/stucco_nor.jpg', 3, 3);
const malakaRoofNor = nor('/textures/roof_nor.jpg', 5, 5);
const malakaStoneNor = nor('/textures/malaka_stone_nor.jpg', 4, 4);
const malakaWoodNor = nor('/textures/wood_nor.jpg', 2, 2);

// Skin: procedural pore-noise normal map — tiled fine over the face
const skinNor = makeSkinNor(256);

// Tree bark: knotted_pine_bark (Poly Haven CC0)
const barkDiff  = rep('/textures/bark_diff.jpg');
const barkNor   = rep('/textures/bark_nor.jpg');
const barkRough = rep('/textures/bark_rough.jpg');
barkDiff.repeat.set(2, 3);
barkNor.repeat.set(2, 3);
barkRough.repeat.set(2, 3);

// Tree canopy colour: aerial_grass_rock diffuse (Poly Haven CC0), tiled for foliage
const canopyDiff = rep('/textures/canopy_diff.jpg');
canopyDiff.repeat.set(4, 4);

// Tree canopy detail: procedural leaf-bump normal map
const canopyNor = makeCanopyNor(256);

/**
 * Force every PBR texture onto the GPU now (decode + upload + mipmap generation),
 * instead of lazily on first render. Called once during the loading screen so the
 * first time a tree, building, or terrain chunk enters view it doesn't trigger a
 * synchronous texture-upload stall on the main thread.
 */
export function warmUpTextures(renderer: THREE.WebGLRenderer): void {
  const all = [
    terrainNor, terrainRough,
    leatherNor, leatherRough,
    silkNor, silkRough, velvetNor, velvetRough, woolNor, woolRough,
    stoneDiff, stoneNor, stoneRough,
    malakaStuccoNor, malakaRoofNor, malakaStoneNor, malakaWoodNor,
    malakaStuccoDiff, malakaRoofDiff, malakaStoneDiff, malakaWoodDiff,
    skinNor,
    barkDiff, barkNor, barkRough,
    canopyDiff, canopyNor,
  ];
  for (const tex of all) renderer.initTexture(tex);
}

/** Add detail normal + roughness maps to the shared terrain material. */
export function applyTerrainPBR(m: THREE.MeshStandardMaterial): void {
  m.normalMap = terrainNor;
  m.normalScale.set(0.6, 0.6);
  m.roughnessMap = terrainRough;
  m.needsUpdate = true; // maps were just added/removed — recompile the shader
}

/**
 * Per-material surface intent for character meshes. Set on a material via
 * `material.userData.charMatKind` (the `vmat` helper exposes a `kind` option) so
 * `applyCharacterPBR` can give it the right finish instead of leathering
 * everything. When absent, the kind is inferred: 'head' → skin, metalness ≥ 0.5
 * → metal, otherwise leather (the legacy default).
 */
export type CharMatKind =
  | 'skin' | 'leather' | 'silk' | 'velvet' | 'wool' | 'gold' | 'metal' | 'none';

type FabricKind = 'silk' | 'velvet' | 'wool';
interface FabricMaps {
  nor: THREE.Texture;
  rough: THREE.Texture;
  /** Normal-map strength — how pronounced the weave relief reads. */
  normalScale: number;
  /** Multiplies the roughness map; < 1 keeps silk glossy, 1 lets the map drive. */
  roughness: number;
  /** envMap reflection strength — silk catches a sheen, matte weaves stay dull. */
  envMapIntensity: number;
}
const FABRIC: Record<FabricKind, FabricMaps> = {
  silk:   { nor: silkNor,   rough: silkRough,   normalScale: 0.4, roughness: 0.7, envMapIntensity: 0.6 },
  velvet: { nor: velvetNor, rough: velvetRough, normalScale: 0.7, roughness: 1.0, envMapIntensity: 0.25 },
  wool:   { nor: woolNor,   rough: woolRough,   normalScale: 1.0, roughness: 1.0, envMapIntensity: 0.2 },
};

/**
 * Route every mesh in a character group to a surface finish based on its
 * `charMatKind` tag (or an inferred default). Gold/metal get a clean reflective
 * metal finish (no bump map, boosted envMap so they mirror the sky), cloth gets
 * its weave's normal map + roughness, the head/skin gets pore detail, and
 * everything else falls back to leather. Emissive and transparent materials are
 * left untouched (eyes, gems, glass, glowing decals) — except explicit
 * gold/metal, which stay reflective.
 */
export function applyCharacterPBR(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = child.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;

    const kind = mat.userData.charMatKind as CharMatKind | undefined;
    if (kind === 'none') return;
    if (kind === 'gold') { applyMetalPBR(mat, true); return; }
    if (kind === 'metal') { applyMetalPBR(mat, false); return; }

    if (mat.transparent) return;
    const emissive = mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.02;

    if (kind === 'silk' || kind === 'velvet' || kind === 'wool') {
      if (!emissive) applyFabricPBR(mat, kind);
      return;
    }
    if (emissive) return;

    if (kind === 'skin' || child.name === 'head') { applySkinPBR(mat); return; }
    if (kind === 'leather') { applyLeatherPBR(mat); return; }

    // No explicit tag — infer from the authored material.
    if (mat.metalness >= 0.5) { applyMetalPBR(mat, false); return; }
    applyLeatherPBR(mat);
  });
}

/** Brown-leather normal + roughness detail (the legacy character default). */
function applyLeatherPBR(m: THREE.MeshStandardMaterial): void {
  m.normalMap = leatherNor;
  m.normalScale.set(0.35, 0.35);
  m.roughnessMap = leatherRough;
  m.needsUpdate = true;
}

/** Scanned-cloth normal + roughness maps for a robe/kilt/turban. */
function applyFabricPBR(m: THREE.MeshStandardMaterial, kind: FabricKind): void {
  const f = FABRIC[kind];
  m.normalMap = f.nor;
  m.normalScale.setScalar(f.normalScale);
  m.roughnessMap = f.rough;
  m.roughness = f.roughness;
  m.metalness = 0;
  m.envMapIntensity = f.envMapIntensity;
  m.needsUpdate = true;
}

/**
 * Clean reflective metal finish. Drops any bump/roughness maps and boosts
 * envMapIntensity so the piece mirrors the scene's PMREM sky (set in
 * SceneManager). `gold` forces a bright polished-gold spec; otherwise the
 * authored colour (steel, bronze) is preserved and just made shinier.
 */
function applyMetalPBR(m: THREE.MeshStandardMaterial, gold: boolean): void {
  m.normalMap = null;
  m.roughnessMap = null;
  if (gold) {
    m.metalness = 1.0;
    m.roughness = 0.28;
  } else {
    m.metalness = Math.max(m.metalness, 0.85);
    m.roughness = Math.min(m.roughness > 0 ? m.roughness : 0.3, 0.35);
  }
  m.envMapIntensity = gold ? 1.9 : 1.5;
  m.needsUpdate = true;
}

/** Apply knotted-pine-bark textures (albedo + normal + roughness) to a trunk material. */
export function applyBarkPBR(m: THREE.MeshStandardMaterial): void {
  m.map       = barkDiff;
  m.normalMap = barkNor;
  m.normalScale.set(0.8, 0.8);
  m.roughnessMap = barkRough;
  m.color.set(0xffffff); // let texture drive colour
  m.needsUpdate = true; // maps were just added/removed — recompile the shader
}

/** Apply grass-rock albedo + procedural leaf-bump normal to a canopy material. */
export function applyCanopyPBR(m: THREE.MeshStandardMaterial): void {
  m.map       = canopyDiff;
  m.normalMap = canopyNor;
  m.normalScale.set(0.5, 0.5);
  m.color.set(0x7ab840); // tint on top of texture — bright sunny green
  m.roughness = 0.90;
  m.needsUpdate = true; // maps were just added/removed — recompile the shader
}

/**
 * Add cobblestone detail to a stone building material. The albedo multiplies
 * with the material's existing `color`, so callers keep their tint (e.g. the
 * moonwell blue, altar purple) while gaining real stone texture + relief.
 */
export function applyStonePBR(m: THREE.MeshStandardMaterial): void {
  m.map = stoneDiff;
  m.normalMap = stoneNor;
  m.normalScale.set(0.85, 0.85); // stronger relief — the masonry was reading too flat
  m.roughnessMap = stoneRough;
  m.needsUpdate = true; // maps were just added/removed — recompile the shader
}

/** Apply the dark-wood albedo + normal (Poly Haven CC0) to a timber material. */
export function applyWoodPBR(m: THREE.MeshStandardMaterial): void {
  m.map = malakaWoodDiff;
  m.normalMap = malakaWoodNor;
  m.normalScale.set(0.5, 0.5);
  m.color.set(0xffffff); // let the wood grain drive colour
  m.needsUpdate = true; // maps were just added/removed — recompile the shader
}

/** Apply custom Malaka architectural PBR maps (albedo + procedural normal). */
export function applyMalakaPBR(
  m: THREE.MeshStandardMaterial,
  type: 'stucco' | 'roof' | 'stone' | 'wood',
): void {
  m.color.set(0xffffff); // let the albedo texture drive colour
  switch (type) {
    case 'stucco':
      m.map = malakaStuccoDiff;
      m.normalMap = malakaStuccoNor;
      m.normalScale.set(0.4, 0.4);
      m.roughness = 0.85; // Matte plaster
      break;
    case 'roof':
      m.map = malakaRoofDiff;
      m.normalMap = malakaRoofNor;
      m.normalScale.set(1.3, 1.3); // strong relief so the clay tiles don't read flat
      m.roughness = 0.75; // Weathered clay
      break;
    case 'stone':
      m.map = malakaStoneDiff;
      m.normalMap = malakaStoneNor;
      m.normalScale.set(0.6, 0.6);
      m.roughness = 0.80; // Old masonry
      break;
    case 'wood':
      m.map = malakaWoodDiff;
      m.normalMap = malakaWoodNor;
      m.normalScale.set(0.5, 0.5);
      m.roughness = 0.8; // Aged timber
      break;
  }
  m.needsUpdate = true; // maps were just added/removed — recompile the shader
}

/** Apply a subtle pore-noise normal map to a skin (face/head) material. */
function applySkinPBR(m: THREE.MeshStandardMaterial): void {
  m.normalMap = skinNor;
  m.normalScale.set(0.12, 0.12); // very subtle — skin is smooth
  m.roughness = 0.82;            // matte, no specular sheen
  m.needsUpdate = true; // maps were just added/removed — recompile the shader
}

/**
 * Procedural canopy normal map: random leaf-shaped bumps to break up the
 * flat cone surface and catch light like overlapping foliage.
 */
function makeCanopyNor(size: number): THREE.Texture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
  }

  const count = 420;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const r = 4 + Math.random() * 10;
    
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= size || py < 0 || py >= size) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) continue;
        
        const idx = (py * size + px) * 4;
        const falloff = 1.0 - dist / r;
        data[idx]     = Math.max(0, Math.min(255, data[idx]! + (Math.random() * 40 - 20) * falloff));
        data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1]! + (Math.random() * 40 - 20) * falloff));
      }
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = ANISOTROPY;
  tex.needsUpdate = true; // DataTexture ctor doesn't flag for upload; without this the normal map never reaches the GPU
  return tex;
}

/**
 * Procedural skin normal map: flat base (128,128,255) with tiny radial
 * indentations scattered across to simulate pores. No file download required.
 */
function makeSkinNor(size: number): THREE.Texture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
  }

  const count = Math.floor(size * size * 0.018);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const r = 0.7 + Math.random() * 1.6;

    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= size || py < 0 || py >= size) continue;
        const distSq = dx * dx + dy * dy;
        if (distSq > r * r) continue;
        
        const idx = (py * size + px) * 4;
        const w = 1.0 - Math.sqrt(distSq) / r;
        data[idx]     = Math.round(128 - 43 * w); // subtle blue-shift dots
        data[idx + 1] = Math.round(128 - 18 * w);
      }
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = ANISOTROPY;
  tex.needsUpdate = true; // DataTexture ctor doesn't flag for upload; without this the normal map never reaches the GPU
  return tex;
}
