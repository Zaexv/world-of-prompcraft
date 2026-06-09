import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';

export class MalakaGardenBed extends Mesh {
  static readonly type = 'malaka_garden_bed';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const gardenMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728, roughness: 1.0,
    });
    const gardenW = 2.5 * scale;
    const gardenD = 4.0 * scale;

    // Raised soil bed
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(gardenW, 0.15 * scale, gardenD), gardenMat,
    );
    bed.position.set(0, 0.075 * scale, 0);
    bed.receiveShadow = true;
    bed.userData.noCollision = true;
    g.add(bed);

    // Stone border around bed
    const borderMat = mats.stone;
    const borderH = 0.2 * scale;
    // Long sides
    for (const sz of [-1, 1]) {
      const border = new THREE.Mesh(
        new THREE.BoxGeometry(gardenW + 0.2 * scale, borderH, 0.12 * scale), borderMat,
      );
      border.position.set(
        0,
        borderH / 2,
        sz * gardenD / 2,
      );
      border.userData.noCollision = true;
      g.add(border);
    }
    // Short sides
    for (const sx of [-1, 1]) {
      const border = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * scale, borderH, gardenD), borderMat,
      );
      border.position.set(
        sx * gardenW / 2,
        borderH / 2,
        0,
      );
      border.userData.noCollision = true;
      g.add(border);
    }

    // Small shrubs / bushes in the garden beds
    const bushMat = new THREE.MeshStandardMaterial({
      color: 0x2d6e2d, roughness: 0.9, emissive: 0x061206,
    });
    for (let i = 0; i < 5; i++) {
      const bushSize = (0.3 + Math.random() * 0.3) * scale;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(bushSize, 5, 5), bushMat);
      bush.position.set(
        (Math.random() - 0.5) * (gardenW - 1 * scale),
        bushSize * 0.7,
        (Math.random() - 0.5) * (gardenD - 1 * scale),
      );
      bush.userData.noCollision = true;
      g.add(bush);
    }

    // Flowers scattered in beds
    const flowerColors = [0xe84393, 0xfdcb6e, 0x6c5ce7, 0xff7675];
    for (let i = 0; i < 6; i++) {
      const fColor = flowerColors[i % flowerColors.length];
      const fMat = new THREE.MeshStandardMaterial({
        color: fColor, emissive: fColor, emissiveIntensity: 0.15,
      });
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 4, 4), fMat);
      flower.position.set(
        (Math.random() - 0.5) * (gardenW - 0.8 * scale),
        0.25 * scale + Math.random() * 0.2 * scale,
        (Math.random() - 0.5) * (gardenD - 0.5 * scale),
      );
      flower.userData.noCollision = true;
      g.add(flower);
    }

    return withLOD(g);
  }
}

registerMesh(MalakaGardenBed);

