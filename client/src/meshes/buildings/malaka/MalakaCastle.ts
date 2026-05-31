import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createHorseshoeArch, createMachicolations } from './MalakaKit';

export class MalakaCastle extends Mesh {
  static readonly type = 'malaka_castle';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // 1. Lower Defensive Tier (The Barbican)
    const tier1W = 16 * scale;
    const tier1H = 6 * scale;
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(tier1W, tier1H, tier1W), mats.stone);
    base1.position.y = tier1H / 2;
    base1.userData.isCollider = true;
    g.add(base1);

    // 2. Middle Palace Tier (with Horseshoe Arches)
    const tier2W = 10 * scale;
    const tier2H = 5 * scale;
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(tier2W, tier2H, tier2W), mats.stone);
    base2.position.set(0, tier1H + tier2H / 2, -2 * scale);
    base2.userData.isCollider = true;
    g.add(base2);

    // 3. Upper Keep (Torre del Homenaje)
    const keepW = 6 * scale;
    const keepH = 8 * scale;
    const keep = new THREE.Mesh(new THREE.BoxGeometry(keepW, keepH, keepW), mats.stone);
    keep.position.set(0, tier1H + tier2H + keepH / 2, -4 * scale);
    keep.userData.isCollider = true;
    g.add(keep);

    // 4. Courtyard Gardens (Green zones on tiers)
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 1.0 });
    const garden = new THREE.Mesh(new THREE.BoxGeometry(tier1W - 2 * scale, 0.2 * scale, 4 * scale), grassMat);
    garden.position.set(0, tier1H + 0.1 * scale, 4 * scale);
    garden.userData.noCollision = true;
    g.add(garden);

    // 5. Corner Turrets (Bartizans)
    for (const tx of [-1, 1]) {
      const turretH = 4 * scale;
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, turretH, 8), mats.stone);
      turret.position.set(tx * (tier1W / 2), tier1H + turretH / 2, tier1W / 2);
      g.add(turret);
    }

    // 6. Horseshoe Arch Entrance
    const gate = createHorseshoeArch(3 * scale, 4 * scale, 1.0 * scale, mats);
    gate.userData.noCollision = true;
    gate.traverse(c => { c.userData.noCollision = true; });
    gate.position.set(0, 0, tier1W / 2 + 0.1 * scale);
    g.add(gate);

    // 7. Arrow Slits and Machicolations
    g.add(createMachicolations(tier1W, tier1W, tier1H, mats, scale));

    return g;
  }
}

registerMesh(MalakaCastle);
