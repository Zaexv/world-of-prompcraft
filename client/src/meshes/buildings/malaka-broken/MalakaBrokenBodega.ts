import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createPergola, createArchedDoor, withLOD } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenBodega extends Mesh {
  static readonly type = 'malaka_broken_bodega';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const length = 18 * scale;
    const width = 10 * scale;
    const height = 7 * scale;

    // 0. Stone Foundation
    const foundationH = 1.2 * scale;
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4 * scale, foundationH, length + 0.4 * scale), mats.stone);
    foundation.position.y = foundationH / 2 - 0.2 * scale;
    foundation.userData.noCollision = true;
    g.add(foundation);

    // 1. Massive Industrial Nave (Bodega)
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mats.stucco);
    body.position.y = foundationH + height / 2 - 0.2 * scale;
    body.castShadow = true;
    body.userData.noCollision = true;
    g.add(body);

    const bodyProxy = boxCollider(width, height + foundationH, length);
    bodyProxy.position.y = (height + foundationH) / 2 - 0.2 * scale;
    g.add(bodyProxy);

    // 2. Buttresses (Contrafuertes) on the sides
    const buttressD = 1.5 * scale;
    const buttressW = 1.0 * scale;
    const bH = height * 0.75;
    for (let z = -length / 2 + 2 * scale; z <= length / 2 - 2 * scale; z += 4 * scale) {
      const bL = new THREE.Mesh(new THREE.BoxGeometry(buttressD, bH, buttressW), mats.stone);
      bL.position.set(-width / 2 - buttressD/2 + 0.2*scale, foundationH + bH/2 - 0.2*scale, z);
      bL.userData.noCollision = true;
      g.add(bL);

      const bR = new THREE.Mesh(new THREE.BoxGeometry(buttressD, bH, buttressW), mats.stone);
      bR.position.set(width / 2 + buttressD/2 - 0.2*scale, foundationH + bH/2 - 0.2*scale, z);
      bR.userData.noCollision = true;
      g.add(bR);
    }

    // 3. High Ventilation Windows (Ventanas Altas)
    const winW = 1.2 * scale;
    const winH = 0.8 * scale;
    for (let z = -length / 2 + 2 * scale; z <= length / 2 - 2 * scale; z += 4 * scale) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, winH, winW), mats.glass);
      winL.position.set(-width / 2, foundationH + height - 1.5 * scale, z);
      winL.userData.noCollision = true;
      g.add(winL);

      const winR = winL.clone();
      winR.position.x = width / 2;
      winR.userData.noCollision = true;
      g.add(winR);
    }

    // 4. Large Main Doors (End)
    const door = createArchedDoor(4.5 * scale, 5.5 * scale, 0.8 * scale, mats);
    door.userData.noCollision = true;
    door.traverse(c => { c.userData.noCollision = true; });
    door.position.set(0, foundationH - 0.2 * scale, length / 2 + 0.1 * scale);
    g.add(door);
    
    // Front Step for Door
    const stepH = 1.0 * scale;
    const step = new THREE.Mesh(new THREE.BoxGeometry(6.0 * scale, stepH, 2.0 * scale), mats.stone);
    step.position.set(0, stepH / 2 - 0.2 * scale, length / 2 + 1.0 * scale);
    step.userData.noCollision = true; 
    g.add(step);
    
    const stepColl = boxCollider(6.0 * scale, stepH, 2.0 * scale);
    stepColl.position.set(0, stepH / 2 - 0.2 * scale, length / 2 + 1.0 * scale);
    g.add(stepColl);

    // 5. Proper Gabled Roof
    const roofH = 3.5 * scale;
    const halfBase = width / 2;
    const angle = Math.atan2(roofH, halfBase);
    const slopeLen = Math.sqrt(roofH * roofH + halfBase * halfBase) + 1.5 * scale;
    
    const peakY = foundationH + height + roofH - 0.2 * scale;
    const cx = (slopeLen / 2) * Math.cos(angle);
    const cy = (slopeLen / 2) * Math.sin(angle);

    const roofL = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.2 * scale, length + 2 * scale), mats.roof);
    roofL.position.set(-cx, peakY - cy, 0);
    roofL.rotation.z = angle;
    roofL.userData.noCollision = true;
    g.add(roofL);

    const roofR = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.2 * scale, length + 2 * scale), mats.roof);
    roofR.position.set(cx, peakY - cy, 0);
    roofR.rotation.z = -angle;
    roofR.userData.noCollision = true;
    g.add(roofR);

    // Fill the gables
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-width/2, 0);
    gableShape.lineTo(0, roofH);
    gableShape.lineTo(width/2, 0);
    gableShape.lineTo(-width/2, 0);
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: length, bevelEnabled: false });
    const gable = new THREE.Mesh(gableGeo, mats.stucco);
    gable.position.set(0, foundationH + height - 0.2 * scale, -length/2);
    gable.userData.noCollision = true;
    g.add(gable);

    for (const s of [-1, 1]) {
        const rColl = boxCollider(slopeLen, 0.4 * scale, length);
        rColl.position.set(s * cx, peakY - cy, 0);
        rColl.rotation.z = s * -angle;
        g.add(rColl);
    }

    // 6. Tasting Porch (Porche de Degustación)
    const porch = createPergola(5 * scale, 6 * scale, scale, mats);
    porch.userData.noCollision = true;
    porch.traverse(c => { c.userData.noCollision = true; });
    porch.position.set(width / 2 + 2.5 * scale, 0, length/2 - 3 * scale);
    g.add(porch);

    // 7. Grapes and Barrels
    const grapeMat = new THREE.MeshStandardMaterial({ color: 0x4a148c, roughness: 0.2, metalness: 0.2 });
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
    
    function createGrapeCluster() {
      const cl = new THREE.Group();
      for (let i=0; i<15; i++) {
         const gr = new THREE.Mesh(new THREE.SphereGeometry(0.12*scale, 4, 4), grapeMat);
         gr.position.set((Math.random()-0.5)*0.3*scale, -Math.random()*0.6*scale, (Math.random()-0.5)*0.3*scale);
         cl.add(gr);
      }
      return cl;
    }

    for (let i = 0; i < 8; i++) {
        const cluster = createGrapeCluster();
        cluster.position.set(
            width / 2 + 2.5 * scale + (Math.random() - 0.5) * 4 * scale,
            2.1 * scale,
            length/2 - 3 * scale + (Math.random() - 0.5) * 5 * scale
        );
        cluster.traverse(c => { c.userData.noCollision = true; });
        g.add(cluster);
    }

    const barrelM = new THREE.Mesh(new THREE.CylinderGeometry(0.4*scale, 0.4*scale, 1.0*scale, 12), mats.wood);
    const bandM = new THREE.MeshStandardMaterial({color: 0x111111, metalness:0.8, roughness:0.4});
    for (const b of [-1, 0, 1]) {
      const barrel = new THREE.Group();
      barrel.add(barrelM.clone());
      const band1 = new THREE.Mesh(new THREE.CylinderGeometry(0.41*scale, 0.41*scale, 0.05*scale, 12), bandM);
      band1.position.y = 0.25*scale;
      const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.41*scale, 0.41*scale, 0.05*scale, 12), bandM);
      band2.position.y = -0.25*scale;
      barrel.add(band1, band2);
      
      barrel.position.set(width/2 + 2.5 * scale + b * 1.5 * scale, 0.5 * scale, length/2 + 1.0 * scale);
      barrel.traverse(c => { c.userData.noCollision = true; });
      g.add(barrel);
    }

    // 8. Vineyard Rows (Viñedo)
    const vineyardL = length * 1.2;
    const groundY = 0;
    
    for(let rx = 1; rx <= 3; rx++) {
       const rowX = -width/2 - 1.5*scale - rx * 3.0 * scale;
       
       for(let pz = -vineyardL/2; pz <= vineyardL/2; pz += 3*scale) {
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15*scale, 2.5*scale, 0.15*scale), mats.wood);
          pole.position.set(rowX, groundY + 1.25*scale, pz);
          pole.userData.noCollision = true;
          g.add(pole);
       }
       
       const vineLine = new THREE.Mesh(new THREE.BoxGeometry(0.8*scale, 0.8*scale, vineyardL), vineMat);
       vineLine.position.set(rowX, groundY + 2.0*scale, 0);
       vineLine.userData.noCollision = true;
       g.add(vineLine);
       
       for(let gz = -vineyardL/2 + 1*scale; gz <= vineyardL/2 - 1*scale; gz += 1.5*scale) {
          const cluster = createGrapeCluster();
          cluster.position.set(rowX + (Math.random()-0.5)*0.4*scale, groundY + 1.7*scale, gz);
          cluster.traverse(c => { c.userData.noCollision = true; });
          g.add(cluster);
       }
       
       const rowCollider = boxCollider(0.4*scale, 2.5*scale, vineyardL);
       rowCollider.position.set(rowX, groundY + 1.25*scale, 0);
       g.add(rowCollider);
    }

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.roof);
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenBodega);
