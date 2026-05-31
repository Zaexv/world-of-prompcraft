import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArchedDoor } from './MalakaKit';

export class MalakaChurch extends Mesh {
  static readonly type = 'malaka_church';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // 1. Massive Stone Base
    const baseW = 16 * scale;
    const baseD = 24 * scale;
    const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, 0.8 * scale, baseD), mats.stone);
    base.position.y = 0.4 * scale;
    base.castShadow = base.receiveShadow = true;
    base.userData.isCollider = true;
    g.add(base);

    // 2. Main Nave (High Cathedral)
    const naveW = 10 * scale;
    const naveH = 14 * scale;
    const naveD = 20 * scale;
    const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), mats.stucco);
    nave.position.y = 0.8 * scale + naveH / 2;
    nave.castShadow = nave.receiveShadow = true;
    nave.userData.isCollider = true;
    g.add(nave);

    // 3. Main Roof (Vaulted/Curved)
    const roofH = 4 * scale;
    const naveRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, naveW / 2 + 0.5 * scale, roofH, 8), mats.roof);
    naveRoof.rotation.z = Math.PI / 4;
    naveRoof.rotation.x = Math.PI / 2;
    naveRoof.scale.set(1, naveD / roofH, 1);
    naveRoof.position.y = 0.8 * scale + naveH + (naveW / 4);
    naveRoof.userData.noCollision = true;
    g.add(naveRoof);

    // 4. Central Dome (Transept)
    const domeR = 5 * scale;
    const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(domeR, domeR, 4 * scale, 16), mats.stone);
    domeBase.position.set(0, 0.8 * scale + naveH + 2 * scale, -2 * scale);
    domeBase.userData.noCollision = true;
    g.add(domeBase);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR + 0.2 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
    dome.position.set(0, 0.8 * scale + naveH + 4 * scale, -2 * scale);
    dome.userData.noCollision = true;
    g.add(dome);

    // 5. The Single Tower ("La Manquita")
    const towerW = 4.5 * scale;
    const towerH = 22 * scale;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), mats.stone);
    tower.position.set(-naveW / 2 + towerW / 2, 0.8 * scale + towerH / 2, naveD / 2 - towerW / 2);
    tower.userData.isCollider = true;
    g.add(tower);

    // Tower Belfry (Open Arches)
    const belfryH = 5 * scale;
    const belfry = new THREE.Mesh(new THREE.CylinderGeometry(towerW * 0.6, towerW * 0.6, belfryH, 8), mats.stone);
    belfry.position.set(-naveW / 2 + towerW / 2, 0.8 * scale + towerH + belfryH / 2, naveD / 2 - towerW / 2);
    belfry.userData.noCollision = true;
    g.add(belfry);

    const belfryDome = new THREE.Mesh(new THREE.SphereGeometry(towerW * 0.6, 8, 8, 0, Math.PI*2, 0, Math.PI/2), mats.roof);
    belfryDome.position.set(-naveW / 2 + towerW / 2, 0.8 * scale + towerH + belfryH, naveD / 2 - towerW / 2);
    belfryDome.userData.noCollision = true;
    g.add(belfryDome);

    // Missing Right Tower Base
    const missingTower = new THREE.Mesh(new THREE.BoxGeometry(towerW, 8 * scale, towerW), mats.stone);
    missingTower.position.set(naveW / 2 - towerW / 2, 0.8 * scale + 4 * scale, naveD / 2 - towerW / 2);
    missingTower.userData.isCollider = true;
    g.add(missingTower);

    // 6. Flying Buttresses (Contrafuertes)
    for (let z = -naveD / 2 + 4 * scale; z <= naveD / 2 - 6 * scale; z += 4 * scale) {
      for (const side of [-1, 1]) {
        const buttress = new THREE.Mesh(new THREE.BoxGeometry(3 * scale, 10 * scale, 1.5 * scale), mats.stone);
        buttress.position.set(side * (naveW / 2 + 1.5 * scale), 0.8 * scale + 5 * scale, z);
        buttress.userData.noCollision = true;
        g.add(buttress);
      }
    }

    // 7. Grand Entrance
    const entrance = createArchedDoor(4.0 * scale, 6.0 * scale, 1.0 * scale, mats);
    entrance.userData.noCollision = true;
    entrance.traverse(c => { c.userData.noCollision = true; });
    entrance.position.set(0, 0.8 * scale, naveD / 2 + 0.4 * scale);
    g.add(entrance);

    return g;
  }
}

registerMesh(MalakaChurch);
