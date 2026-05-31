import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createRoofTile,
  createArchedDoor,
  createWindowWithGrille,
} from './MalakaKit';

export class MalakaErmita extends Mesh {
  static readonly type = 'malaka_ermita';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const naveW = 5 * scale;
    const naveD = 8 * scale;
    const naveH = 5 * scale;
    const facadeH = 9 * scale;

    // 1. Deep Stone Foundation (Prevents 'flying' on slopes)
    const foundH = 2.0 * scale; // Deep enough to bury into hill
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(naveW + 0.4 * scale, foundH, naveD + 0.4 * scale), mats.stone);
    foundation.position.y = -foundH / 2 + 0.4 * scale; // Top sits slightly above ground
    g.add(foundation);

    // 1b. Stone Walkway around the base
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(naveW + 5 * scale, 0.1 * scale, naveD + 5 * scale), mats.stone);
    walkway.position.y = 0.05 * scale;
    g.add(walkway);

    // 2. Main Nave Body (Andalusian White)
    const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), mats.stucco);
    nave.position.y = naveH / 2 + 0.1 * scale;
    nave.castShadow = nave.receiveShadow = true;
    nave.userData.isCollider = true;
    g.add(nave);

    // 3. Gabled Roof (Vibrant Red)
    const roofH = 2.8 * scale;
    const roofOverhang = 0.8 * scale;
    const roofGeo = new THREE.CylinderGeometry(0.01, Math.sqrt(Math.pow((naveW + roofOverhang)/2, 2) * 2), roofH, 4);
    const roof = new THREE.Mesh(roofGeo, mats.roof);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = naveH + roofH / 2 + 0.1 * scale;
    g.add(roof);

    // 3b. High-detail 3D Roof Tiles
    const tileCount = 14;
    for (let side = 0; side < 2; side++) {
      const sz = side === 0 ? (naveD / 2) + 0.2 * scale : -(naveD / 2) - 0.2 * scale;
      for (let j = 0; j < tileCount; j++) {
        const tile = createRoofTile(scale, mats);
        tile.userData.noCollision = true;
        const tx = (j / (tileCount - 1) - 0.5) * (naveW + roofOverhang);
        tile.position.set(tx, naveH + 0.2 * scale, sz);
        g.add(tile);
      }
    }

    // 4. Front Facade (Espadaña)
    const facadeW = naveW + 1.2 * scale;
    const facadeT = 1.0 * scale;
    const facade = new THREE.Mesh(new THREE.BoxGeometry(facadeW, facadeH, facadeT), mats.stucco);
    facade.position.set(0, facadeH / 2 + 0.1 * scale, naveD / 2 + facadeT / 2);
    facade.castShadow = true;
    g.add(facade);

    const crownH = 2.5 * scale;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(facadeW / 2, crownH, 4), mats.stucco);
    crown.rotation.y = Math.PI / 4;
    crown.position.set(0, facadeH + crownH / 2 + 0.1 * scale, naveD / 2 + facadeT / 2);
    g.add(crown);

    // Bell Opening
    const bellOpening = createArchedDoor(1.8 * scale, 3.0 * scale, facadeT + 0.2, mats);
    const voidMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 });
    bellOpening.traverse(c => { if(c instanceof THREE.Mesh) c.material = voidMat; });
    bellOpening.position.set(0, facadeH - 1.2 * scale, naveD / 2 + facadeT / 2);
    g.add(bellOpening);

    // 4b. Realistic Bell Shape (Lathe-like curve)
    const bellPoints = [];
    for (let i = 0; i <= 10; i++) {
      const r = 0.2 * scale + Math.pow(i/10, 2) * 0.4 * scale;
      const y = (i/10) * 0.8 * scale;
      bellPoints.push(new THREE.Vector2(r, -y));
    }
    const bellGeo = new THREE.LatheGeometry(bellPoints, 16);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1.0, roughness: 0.1 });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.position.set(0, facadeH + 0.1 * scale, naveD / 2 + facadeT / 2);
    g.add(bell);

    const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.6 * scale, 0.3 * scale, 0.4 * scale), mats.wood);
    yoke.position.set(0, facadeH + 0.3 * scale, naveD / 2 + facadeT / 2);
    g.add(yoke);

    // 5. Main Entrance
    const door = createArchedDoor(2.4 * scale, 3.8 * scale, 0.5 * scale, mats);
    door.position.set(0, 0.1 * scale, naveD / 2 + facadeT + 0.05 * scale);
    g.add(door);

    // 6. Recessed Oculus
    const oculusFrame = new THREE.Mesh(new THREE.TorusGeometry(0.6 * scale, 0.08 * scale, 8, 24), mats.stone);
    oculusFrame.position.set(0, facadeH - 4.5 * scale, naveD / 2 + facadeT + 0.1 * scale);
    g.add(oculusFrame);

    const oculusGlass = new THREE.Mesh(new THREE.CircleGeometry(0.55 * scale, 24), voidMat);
    oculusGlass.position.set(0, facadeH - 4.5 * scale, naveD / 2 + facadeT + 0.05 * scale);
    g.add(oculusGlass);

    // 7. More Windows (Side and Rear)
    const winW = 0.8 * scale;
    const winH = 1.2 * scale;
    for (let i = -1; i <= 1; i++) {
      const sideZ = i * 2.5 * scale;
      for (const sideX of [naveW/2 + 0.05 * scale, -naveW/2 - 0.05 * scale]) {
        const win = createWindowWithGrille(winW, winH, scale, mats);
        win.rotation.y = sideX > 0 ? Math.PI/2 : -Math.PI/2;
        win.position.set(sideX, 2.5 * scale, sideZ);
        g.add(win);
      }
    }

    const rearWin = createWindowWithGrille(winW, winH, scale, mats);
    rearWin.rotation.y = Math.PI;
    rearWin.position.set(0, 3.0 * scale, -naveD/2 - 0.05 * scale);
    g.add(rearWin);

    return g;
  }
}

registerMesh(MalakaErmita);
