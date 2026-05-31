import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArchedDoor, createWindowWithGrille, withLOD } from './MalakaKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

/** A stone box whose masonry tiles at a constant world scale (no stretching). */
function stoneBox(mats: ReturnType<typeof getMaterials>, w: number, h: number, d: number): THREE.Mesh {
  // Plain stone box; applyWorldTiling(g, mats.stone) at the end of build()
  // rewrites the UVs to world scale and swaps in the 1×1-tiled material.
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.stone);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export class MalakaChurch extends Mesh {
  static readonly type = 'malaka_church';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // 1. Massive Stone Base (Plinth)
    const baseW = 16 * scale;
    const baseD = 24 * scale;
    const baseH = 0.8 * scale; // Keep main's lower base
    const base = stoneBox(mats, baseW, baseH, baseD);
    base.position.y = baseH / 2;
    base.castShadow = base.receiveShadow = true;
    // We add explicit proxies at the end, but kept for visibility
    g.add(base);

    // Steps leading to the entrance
    const stepsW = 6.0 * scale;
    const stepsD = 3.0 * scale;
    const stepH = baseH / 3;
    for (let i = 0; i < 3; i++) {
      const stepDepth = stepsD - (i * 0.8 * scale);
      const stepY = stepH / 2 + i * stepH;
      const stepZ = baseD / 2 + (stepsD / 2) - (i * 0.4 * scale);
      const step = new THREE.Mesh(new THREE.BoxGeometry(stepsW, stepH, stepDepth), mats.stone);
      step.position.set(0, stepY, stepZ);
      g.add(step);

      // Matching collider — the church collides via explicit proxies, so these
      // render steps would otherwise be ignored and the player couldn't climb
      // onto the plinth (it would hit the base proxy's vertical front face).
      const stepProxy = boxCollider(stepsW, stepH, stepDepth);
      stepProxy.position.set(0, stepY, stepZ);
      g.add(stepProxy);
    }

    // 2. Main Nave (High Cathedral)
    const naveW = 10 * scale;
    const naveH = 15 * scale;
    const naveD = 20 * scale;
    // Overlap the base so the nave's bottom face is buried inside it (no coplanar
    // seam → no z-fighting). Keeps the top edge exactly at baseH + naveH.
    const naveSink = 0.3 * scale;
    const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH + naveSink, naveD), mats.stucco);
    nave.position.y = baseH + naveH / 2 - naveSink / 2;
    nave.castShadow = nave.receiveShadow = true;
    g.add(nave);

    // Nave Side Windows (Tall Arched)
    for (let z = -naveD / 2 + 3 * scale; z <= naveD / 2 - 3 * scale; z += 4 * scale) {
      for (const side of [-1, 1]) {
        const win = createWindowWithGrille(1.2 * scale, 3.5 * scale, scale, mats);
        win.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
        win.position.set(side * (naveW / 2 + 0.05 * scale), baseH + naveH * 0.6, z);
        g.add(win);
      }
    }

    // 3. Main Roof (Vaulted/Curved)
    const roofH = 4 * scale;
    const naveRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, naveW / 2 + 0.5 * scale, roofH, 24), mats.roof);
    naveRoof.rotation.z = Math.PI / 4;
    naveRoof.rotation.x = Math.PI / 2;
    naveRoof.scale.set(1, naveD / roofH, 1);
    naveRoof.position.y = baseH + naveH + (naveW / 4);
    naveRoof.userData.noCollision = true;
    g.add(naveRoof);

    // 4. Central Dome (Transept) - Upgraded with Drum
    const domeR = 5 * scale;
    
    // Drum extends 0.6 below the nave top so its base ring sits inside the nave
    // instead of coplanar with the nave's top face. Top stays at +naveH + drumH.
    const drumH = 3 * scale;
    const drumSink = 0.6 * scale;
    const domeDrum = new THREE.Mesh(new THREE.CylinderGeometry(domeR, domeR, drumH + drumSink, 16), mats.stucco);
    domeDrum.position.set(0, baseH + naveH + drumH / 2 - drumSink / 2, -2 * scale);
    domeDrum.userData.noCollision = true;
    g.add(domeDrum);

    // Drum Windows
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const win = createWindowWithGrille(1.0 * scale, 1.8 * scale, scale, mats);
      win.position.set(Math.sin(angle) * (domeR + 0.05 * scale), baseH + naveH + drumH / 2, -2 * scale + Math.cos(angle) * (domeR + 0.05 * scale));
      win.rotation.y = angle;
      g.add(win);
    }

    const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR + 0.2 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
    dome.position.set(0, baseH + naveH + drumH, -2 * scale);
    dome.userData.noCollision = true;
    g.add(dome);

    // Dome Lantern
    const lanternR = 1.2 * scale;
    const lanternH = 2.0 * scale;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(lanternR, lanternR, lanternH, 8), mats.stone);
    lantern.position.set(0, baseH + naveH + drumH + domeR, -2 * scale);
    g.add(lantern);
    const lanternRoof = new THREE.Mesh(new THREE.ConeGeometry(lanternR + 0.2 * scale, 1.5 * scale, 8), mats.roof);
    lanternRoof.position.set(0, baseH + naveH + drumH + domeR + lanternH / 2 + 0.75 * scale, -2 * scale);
    g.add(lanternRoof);

    // 5. The Single Tower ("La Manquita")
    const towerW = 4.8 * scale;
    const towerH = 24 * scale;
    // Nudge the tower outward so its outer faces clear the nave walls instead of
    // being coplanar with them; the inner half still overlaps the nave (no seam).
    const towerX = -naveW / 2 + towerW / 2 - 0.3 * scale;
    const towerZ = naveD / 2 - towerW / 2 + 0.3 * scale;
    const tower = stoneBox(mats, towerW, towerH, towerW);
    tower.position.set(towerX, baseH + towerH / 2, towerZ);
    g.add(tower);

    // Tower Cornices
    const cornice1 = new THREE.Mesh(new THREE.BoxGeometry(towerW + 0.4 * scale, 0.4 * scale, towerW + 0.4 * scale), mats.stone);
    cornice1.position.set(towerX, baseH + towerH * 0.4, towerZ);
    g.add(cornice1);
    
    const cornice2 = new THREE.Mesh(new THREE.BoxGeometry(towerW + 0.6 * scale, 0.6 * scale, towerW + 0.6 * scale), mats.stone);
    cornice2.position.set(towerX, baseH + towerH, towerZ);
    g.add(cornice2);

    // Tower Belfry (Open Arches)
    const belfryH = 6 * scale;
    const belfry = new THREE.Mesh(new THREE.CylinderGeometry(towerW * 0.55, towerW * 0.55, belfryH, 8), mats.stucco);
    belfry.position.set(towerX, baseH + towerH + belfryH / 2 + 0.3 * scale, towerZ);
    belfry.userData.noCollision = true;
    g.add(belfry);

    const belfryDome = new THREE.Mesh(new THREE.SphereGeometry(towerW * 0.55, 16, 16, 0, Math.PI*2, 0, Math.PI/2), mats.roof);
    belfryDome.position.set(towerX, baseH + towerH + belfryH + 0.3 * scale, towerZ);
    belfryDome.userData.noCollision = true;
    g.add(belfryDome);

    // Missing Right Tower Base — mirror the outward nudge of the main tower.
    const missingTower = stoneBox(mats, towerW, 8 * scale, towerW);
    missingTower.position.set(naveW / 2 - towerW / 2 + 0.3 * scale, baseH + 4 * scale, naveD / 2 - towerW / 2 + 0.3 * scale);
    g.add(missingTower);

    // 6. Flying Buttresses (Contrafuertes) - Improved with Slopes
    for (let z = -naveD / 2 + 4 * scale; z <= naveD / 2 - 6 * scale; z += 4 * scale) {
      for (const side of [-1, 1]) {
        // Vertical Pillar
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(2 * scale, 8 * scale, 1.5 * scale), mats.stone);
        pillar.position.set(side * (naveW / 2 + 2.5 * scale), baseH + 4 * scale, z);
        pillar.userData.noCollision = true;
        g.add(pillar);

        // Angled Arch (Simplified with rotated box)
        const arch = new THREE.Mesh(new THREE.BoxGeometry(3 * scale, 1 * scale, 1.5 * scale), mats.stone);
        arch.position.set(side * (naveW / 2 + 1.25 * scale), baseH + 8.5 * scale, z);
        arch.rotation.z = side * (Math.PI / 6);
        arch.userData.noCollision = true;
        g.add(arch);
      }
    }

    // 7. Grand Entrance
    const entrance = createArchedDoor(4.0 * scale, 6.0 * scale, 1.0 * scale, mats);
    entrance.userData.noCollision = true;
    entrance.traverse(c => { c.userData.noCollision = true; });
    entrance.position.set(0, baseH, naveD / 2 + 0.4 * scale);
    g.add(entrance);

    // Rose Window above Entrance
    const roseOuter = new THREE.Mesh(new THREE.TorusGeometry(1.8 * scale, 0.2 * scale, 8, 24), mats.stone);
    roseOuter.position.set(0, baseH + 10 * scale, naveD / 2 + 0.1 * scale);
    g.add(roseOuter);
    
    const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(1.8 * scale, 24), mats.glass);
    roseGlass.position.set(0, baseH + 10 * scale, naveD / 2 + 0.05 * scale);
    g.add(roseGlass);

    // ── Collision proxies (explicit invisible hitboxes) ──────────
    // The capsule collides against these clean convex boxes instead of the
    // decorated stone/stucco render meshes above. They mirror the visible solid
    // masonry — including the buttresses.
    const naveProxy = boxCollider(naveW, naveH, naveD);
    naveProxy.position.y = baseH + naveH / 2;
    g.add(naveProxy);

    const baseProxy = boxCollider(baseW, baseH, baseD);
    baseProxy.position.y = baseH / 2;
    g.add(baseProxy);

    const towerProxy = boxCollider(towerW, towerH, towerW);
    towerProxy.position.set(towerX, baseH + towerH / 2, towerZ);
    g.add(towerProxy);

    const missingTowerProxy = boxCollider(towerW, 8 * scale, towerW);
    missingTowerProxy.position.set(naveW / 2 - towerW / 2 + 0.3 * scale, baseH + 4 * scale, naveD / 2 - towerW / 2 + 0.3 * scale);
    g.add(missingTowerProxy);

    // Proxies for the buttress vertical pillars
    for (let z = -naveD / 2 + 4 * scale; z <= naveD / 2 - 6 * scale; z += 4 * scale) {
      for (const side of [-1, 1]) {
        const buttressProxy = boxCollider(2 * scale, 8 * scale, 1.5 * scale);
        buttressProxy.position.set(side * (naveW / 2 + 2.5 * scale), baseH + 4 * scale, z);
        g.add(buttressProxy);
      }
    }

    // World-tile every stone surface (base, towers, steps, cornices, lantern,
    // buttress pillars, rose frame…) so the masonry stays a constant block size
    // instead of stretching across large faces. Stucco is untouched.
    applyWorldTiling(g, mats.stone);
    // Same for the clay roof: the nave vault is a cone scaled 5× along its axis,
    // so without scale-aware tiling its tiles smear; this keeps them uniform
    // across the vault, dome, lantern cap and belfry dome.
    applyWorldTiling(g, mats.roof);

    return withLOD(g);
  }
}

registerMesh(MalakaChurch);
