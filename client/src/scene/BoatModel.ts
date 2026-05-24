import * as THREE from 'three';

export interface BoatModelOptions {
  scale?: number;
  withSail?: boolean;
  markColliders?: boolean;
}

interface BoatTextureSet {
  hull: THREE.Texture;
  trim: THREE.Texture;
  sail: THREE.Texture;
}

let cachedBoatTextures: BoatTextureSet | null = null;

function getBoatTextures(): BoatTextureSet | null {
  if (cachedBoatTextures) return cachedBoatTextures;
  if (typeof document === 'undefined') return null;

  const makeTexture = (width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    return [canvas, ctx];
  };

  const [hullCanvas, hullCtx] = makeTexture(1024, 512);
  const hullGrad = hullCtx.createLinearGradient(0, 0, 0, hullCanvas.height);
  hullGrad.addColorStop(0, '#6f4b2e');
  hullGrad.addColorStop(0.5, '#55361f');
  hullGrad.addColorStop(1, '#3b2415');
  hullCtx.fillStyle = hullGrad;
  hullCtx.fillRect(0, 0, hullCanvas.width, hullCanvas.height);
  for (let y = 10; y < hullCanvas.height; y += 22) {
    const shade = 35 + ((y * 11) % 30);
    hullCtx.fillStyle = `rgba(${shade}, ${24 + (y % 20)}, ${12 + (y % 12)}, 0.45)`;
    hullCtx.fillRect(0, y, hullCanvas.width, 3);
  }
  for (let i = 0; i < 80; i++) {
    const x = (i * 137) % hullCanvas.width;
    const y = (i * 73) % hullCanvas.height;
    const r = 3 + ((i * 7) % 6);
    hullCtx.strokeStyle = 'rgba(28, 16, 8, 0.35)';
    hullCtx.lineWidth = 1;
    hullCtx.beginPath();
    hullCtx.arc(x, y, r, 0, Math.PI * 2);
    hullCtx.stroke();
  }

  const [trimCanvas, trimCtx] = makeTexture(512, 256);
  trimCtx.fillStyle = '#8e6338';
  trimCtx.fillRect(0, 0, trimCanvas.width, trimCanvas.height);
  for (let x = 0; x < trimCanvas.width; x += 16) {
    trimCtx.fillStyle = x % 32 === 0 ? 'rgba(255, 224, 168, 0.08)' : 'rgba(44, 26, 12, 0.14)';
    trimCtx.fillRect(x, 0, 2, trimCanvas.height);
  }

  const [sailCanvas, sailCtx] = makeTexture(512, 512);
  sailCtx.fillStyle = '#d8def0';
  sailCtx.fillRect(0, 0, sailCanvas.width, sailCanvas.height);
  for (let y = 24; y < sailCanvas.height; y += 28) {
    sailCtx.fillStyle = y % 56 === 0 ? 'rgba(110, 128, 168, 0.25)' : 'rgba(140, 152, 182, 0.16)';
    sailCtx.fillRect(0, y, sailCanvas.width, 2);
  }
  sailCtx.strokeStyle = 'rgba(72, 88, 132, 0.6)';
  sailCtx.lineWidth = 5;
  sailCtx.beginPath();
  sailCtx.moveTo(160, 340);
  sailCtx.quadraticCurveTo(250, 240, 336, 312);
  sailCtx.quadraticCurveTo(260, 368, 160, 340);
  sailCtx.stroke();
  sailCtx.fillStyle = 'rgba(72, 255, 170, 0.22)';
  sailCtx.fill();

  const hullMap = new THREE.CanvasTexture(hullCanvas);
  hullMap.wrapS = hullMap.wrapT = THREE.RepeatWrapping;
  hullMap.repeat.set(1.8, 1.0);

  const trimMap = new THREE.CanvasTexture(trimCanvas);
  trimMap.wrapS = trimMap.wrapT = THREE.RepeatWrapping;
  trimMap.repeat.set(2.2, 1.2);

  const sailMap = new THREE.CanvasTexture(sailCanvas);
  sailMap.wrapS = sailMap.wrapT = THREE.ClampToEdgeWrapping;

  cachedBoatTextures = { hull: hullMap, trim: trimMap, sail: sailMap };
  return cachedBoatTextures;
}

export function createBoatModel(options: BoatModelOptions = {}): THREE.Group {
  const { scale = 1, withSail = true, markColliders = false } = options;
  const boat = new THREE.Group();
  const textures = getBoatTextures();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x4b3121,
    roughness: 0.74,
    metalness: 0.05,
    ...(textures ? {
      map: textures.hull,
      bumpMap: textures.hull,
      bumpScale: 0.06,
    } : {}),
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x7a5631,
    roughness: 0.58,
    metalness: 0.04,
    ...(textures ? {
      map: textures.trim,
      bumpMap: textures.trim,
      bumpScale: 0.03,
    } : {}),
  });
  const sailMat = new THREE.MeshStandardMaterial({
    color: 0xd2d8e8,
    roughness: 0.86,
    side: THREE.DoubleSide,
    ...(textures ? {
      map: textures.sail,
      bumpMap: textures.sail,
      bumpScale: 0.015,
    } : {}),
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x44ff88,
    emissive: 0x44ff88,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });

  const hullShape = new THREE.Shape();
  hullShape.moveTo(-4.9, -0.12);
  hullShape.lineTo(-4.4, 0.58);
  hullShape.lineTo(-2.1, 1.12);
  hullShape.lineTo(2.7, 1.04);
  hullShape.lineTo(4.75, 0.6);
  hullShape.lineTo(5.2, 0.18);
  hullShape.lineTo(4.7, -0.08);
  hullShape.lineTo(-4.9, -0.12);
  const hull = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.8,
      bevelEnabled: false,
    }),
    hullMat,
  );
  hull.geometry.translate(0, 0, -0.9);
  hull.position.y = 0.56;
  hull.castShadow = true;
  hull.receiveShadow = true;
  if (markColliders) hull.userData.isCollider = true;
  boat.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.35, 18), trimMat);
  bow.rotation.z = -Math.PI / 2;
  bow.position.set(5.25, 1.0, 0);
  bow.castShadow = true;
  bow.receiveShadow = true;
  if (markColliders) bow.userData.isCollider = true;
  boat.add(bow);

  const stern = new THREE.Mesh(new THREE.ConeGeometry(0.84, 1.0, 18), trimMat);
  stern.rotation.z = Math.PI / 2;
  stern.position.set(-5.1, 0.88, 0);
  stern.castShadow = true;
  stern.receiveShadow = true;
  if (markColliders) stern.userData.isCollider = true;
  boat.add(stern);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.18, 1.48), trimMat);
  deck.position.y = 1.32;
  deck.castShadow = true;
  deck.receiveShadow = true;
  if (markColliders) deck.userData.isCollider = true;
  boat.add(deck);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.22, 0.2), trimMat);
  keel.position.y = 0.04;
  keel.castShadow = true;
  keel.receiveShadow = true;
  boat.add(keel);

  const railPort = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.12, 0.1), trimMat);
  railPort.position.set(-0.05, 1.47, 0.86);
  railPort.castShadow = true;
  railPort.receiveShadow = true;
  boat.add(railPort);

  const railStarboard = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.12, 0.1), trimMat);
  railStarboard.position.set(-0.05, 1.47, -0.86);
  railStarboard.castShadow = true;
  railStarboard.receiveShadow = true;
  boat.add(railStarboard);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.9, 12), trimMat);
  mast.position.set(-0.35, 3.25, 0);
  mast.castShadow = true;
  mast.receiveShadow = true;
  if (markColliders) mast.userData.isCollider = true;
  boat.add(mast);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.7, 8), trimMat);
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-1.1, 3.85, 0);
  boom.castShadow = true;
  boom.receiveShadow = true;
  boat.add(boom);

  if (withSail) {
    const sailShape = new THREE.Shape();
    sailShape.moveTo(-1.8, 2.3);
    sailShape.lineTo(-1.8, 5.1);
    sailShape.lineTo(0.3, 3.9);
    sailShape.lineTo(-1.8, 2.3);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat);
    sail.castShadow = true;
    sail.receiveShadow = true;
    boat.add(sail);
  }

  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat);
  lantern.position.set(3.3, 1.4, 0);
  lantern.castShadow = true;
  lantern.receiveShadow = true;
  boat.add(lantern);

  const bowRune = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 6, 14), glowMat);
  bowRune.rotation.y = Math.PI / 2;
  bowRune.position.set(4.2, 1.06, 0);
  bowRune.castShadow = true;
  bowRune.receiveShadow = true;
  boat.add(bowRune);

  boat.scale.setScalar(scale);
  return boat;
}
