import * as THREE from 'three';

/**
 * Loads the equirectangular skybox and applies it as both the scene
 * background and the IBL environment map.
 *
 * After loading, samples the horizon pixel (elevation = 0) to synchronise
 * the scene fog colour so geometry fades seamlessly into the sky.
 */
export class Skybox {
  constructor(scene: THREE.Scene) {
    const loader = new THREE.TextureLoader();
    loader.load(
      '/skybox.png',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;

        // Sync fog to the skybox horizon so fogged terrain blends into the sky.
        const horizonColor = sampleHorizonColor(texture);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.copy(horizonColor);
        }
        // Also update the solid fallback background colour (visible until texture loads).
        scene.background = texture;
      },
      undefined,
      () => {
        // Skybox missing — keep the solid sky-blue set in SceneManager.
      },
    );
  }
}

/**
 * Reads the centre-row pixel of an equirectangular texture.
 * u = 0 (any longitude works for a uniform sky horizon), v = 0.5 (elevation 0).
 */
function sampleHorizonColor(texture: THREE.Texture): THREE.Color {
  const img = texture.image as HTMLImageElement | ImageBitmap | undefined;
  if (!img) return new THREE.Color(0x87ceeb);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Color(0x87ceeb);

    const src = img as HTMLImageElement;
    const sw = src.naturalWidth ?? (src as unknown as { width: number }).width ?? 1;
    const sh = src.naturalHeight ?? (src as unknown as { height: number }).height ?? 1;

    // Sample at u=0.25 (90° around the equator), v=0.5 (horizon line).
    ctx.drawImage(
      src as CanvasImageSource,
      Math.floor(sw * 0.25), Math.floor(sh * 0.5),
      1, 1,
      0, 0, 1, 1,
    );

    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color(r / 255, g / 255, b / 255);
  } catch {
    return new THREE.Color(0x87ceeb);
  }
}
