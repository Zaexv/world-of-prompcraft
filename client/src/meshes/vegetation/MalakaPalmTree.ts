import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { boxCollider } from '../../systems/worldbuilder/colliderProxy';

let _trunkMat: THREE.MeshStandardMaterial | null = null;
let _leafMat: THREE.MeshStandardMaterial | null = null;

function getTrunkMat() {
  if (!_trunkMat) {
    // Beautiful detailed brown texture for palm trunk
    _trunkMat = new THREE.MeshStandardMaterial({ 
      color: 0x8b5a2b, 
      roughness: 0.9, 
      metalness: 0.0
    });
  }
  return _trunkMat;
}

function getLeafMat() {
  if (!_leafMat) {
    // Vibrant green for healthy palm fronds
    _leafMat = new THREE.MeshStandardMaterial({ 
      color: 0x228b22, 
      roughness: 0.7, 
      side: THREE.DoubleSide 
    });
  }
  return _leafMat;
}

// Helper to create a single arched palm frond
function createPalmFrond(scale: number, length: number): THREE.Group {
  const frondGroup = new THREE.Group();
  const leafMat = getLeafMat();

  // The main stem of the frond
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04 * scale, 0.01 * scale, length, 4),
    getTrunkMat()
  );
  stem.rotation.x = Math.PI / 2;
  stem.position.z = length / 2;
  frondGroup.add(stem);

  // Add individual leaves along the stem to make a beautiful feather-like frond
  const leafCount = 12;
  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount - 1);
    // Leaves get smaller towards the tip
    const leafWidth = (0.2 + 0.3 * Math.sin(t * Math.PI)) * scale;
    const leafLength = (0.6 + 0.6 * Math.sin(t * Math.PI)) * scale;
    
    // Left leaflet
    const leafletL = new THREE.Mesh(
      new THREE.PlaneGeometry(leafWidth, leafLength),
      leafMat
    );
    leafletL.rotation.x = -Math.PI / 2;
    leafletL.rotation.y = 0.4; // Angle outwards
    leafletL.rotation.z = -0.2; // Angle downwards
    leafletL.position.set(leafWidth / 2, 0, (t * length * 0.9) + 0.1);
    leafletL.castShadow = true;
    frondGroup.add(leafletL);

    // Right leaflet
    const leafletR = new THREE.Mesh(
      new THREE.PlaneGeometry(leafWidth, leafLength),
      leafMat
    );
    leafletR.rotation.x = -Math.PI / 2;
    leafletR.rotation.y = -0.4; // Angle outwards
    leafletR.rotation.z = 0.2; // Angle downwards
    leafletR.position.set(-leafWidth / 2, 0, (t * length * 0.9) + 0.1);
    leafletR.castShadow = true;
    frondGroup.add(leafletR);
  }

  return frondGroup;
}

function buildTreeGroup(pos: THREE.Vector3, scale: number, segs: number, frondCount: number, castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = getTrunkMat();

  const seed = Math.abs(pos.x * 100 + pos.z * 100) || 1;
  const pseudoRand = (function() {
     let t = seed;
     return function() { t = (t * 16807) % 2147483647; return (t - 1) / 2147483646; };
  })();

  const tH = 8 * scale;
  
  // Tapered trunk using stacked, overlapping rings for a realistic palm trunk look
  const trunkGroup = new THREE.Group();
  const ringCount = 20;
  let currentY = 0;
  let currentRadius = 0.4 * scale;
  
  // Create a slight curve for the trunk
  const bendX = (pseudoRand() - 0.5) * 2 * scale;
  const bendZ = (pseudoRand() - 0.5) * 2 * scale;
  
  for (let i = 0; i < ringCount; i++) {
    const t = i / (ringCount - 1);
    const ringHeight = (tH / ringCount) * 1.2; // slight overlap
    const nextRadius = 0.4 * scale * (1 - t * 0.5); // tapers to half radius
    
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(nextRadius, currentRadius, ringHeight, segs),
      trunkMat
    );
    
    // Position along the curved path
    const xPos = bendX * (t * t); // curve accelerates towards the top
    const zPos = bendZ * (t * t);
    
    ring.position.set(xPos, currentY + ringHeight / 2, zPos);
    
    // Tilt the rings slightly to follow the curve
    if (i > 0) {
      ring.rotation.z = -bendX * 2 * t / tH;
      ring.rotation.x = bendZ * 2 * t / tH;
    }
    
    ring.castShadow = castShadow;
    ring.receiveShadow = true;
    trunkGroup.add(ring);
    
    currentY += ringHeight * 0.8; // overlap
    currentRadius = nextRadius;
  }
  
  trunkGroup.userData.isCollider = true;
  g.add(trunkGroup);

  const trunkCol = boxCollider(0.8 * scale, tH, 0.8 * scale);
  trunkCol.position.set(bendX / 2, tH / 2, bendZ / 2);
  g.add(trunkCol);

  // Crown (Fronds and Coconuts)
  const crown = new THREE.Group();
  crown.position.set(bendX, currentY, bendZ);

  // Beautiful sweeping palm fronds
  for (let i = 0; i < frondCount; i++) {
    const angle = (i * Math.PI * 2) / frondCount;
    const length = (3.5 + pseudoRand() * 1.5) * scale;
    
    const frond = createPalmFrond(scale, length);
    frond.rotation.y = angle + (pseudoRand() * 0.2);
    
    // Arch the frond downwards using a curved path or simple rotation
    // We will just angle it outwards and downwards
    const droopAngle = Math.PI / 6 + pseudoRand() * (Math.PI / 4);
    frond.rotation.x = droopAngle;
    
    crown.add(frond);
  }

  // Coconuts
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 1.0 });
  for (let i = 0; i < 4; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 8, 8), nutMat);
    nut.position.set(
      (pseudoRand() - 0.5) * 1.2 * scale,
      -0.4 * scale,
      (pseudoRand() - 0.5) * 1.2 * scale
    );
    nut.castShadow = castShadow;
    crown.add(nut);
  }

  g.add(crown);
  return g;
}

export class MalakaPalmTree extends Mesh {
  static readonly type = 'malaka_palmtree';
  static readonly category = 'vegetation' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    lod.addLevel(buildTreeGroup(pos, scale, 12, 12, true), 0);
    lod.addLevel(buildTreeGroup(pos, scale, 8, 8, true), 180);
    lod.addLevel(buildTreeGroup(pos, scale, 5, 5, false), 360);

    return lod;
  }
}

registerMesh(MalakaPalmTree);
