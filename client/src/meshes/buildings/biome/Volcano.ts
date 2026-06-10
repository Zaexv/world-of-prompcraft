import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';
import { createEmberParticles } from '../../props/fireParticles';

/**
 * Volcano — the signature landmark of the Blasted Suarezlands.
 *
 * A layered basalt cone (built from stacked truncated cones so the crater rim
 * sits correctly on a flat top, not a needle apex), a glowing molten crater,
 * lava flows streaking down the flanks, basalt rubble at the foot, and rising
 * embers. Kept to ~a dozen mesh pieces per BiomeKit convention.
 *
 * Tunable silhouette constants up top so the shape stays easy to modify.
 */
const BASE_R = 8.0;    // radius at the foot
const TOP_R = 3.2;     // radius at the crater rim
const HEIGHT = 13.0;   // foot → rim
const LIP = 0.6;       // crater rim height above HEIGHT

export class Volcano extends Mesh {
  static readonly type = 'biome_volcano';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);

    const basaltDark = m(0x140b08, 0.95);
    const basalt = m(0x241410, 0.92);
    const ash = m(0x2e1c14, 0.9);
    const lava = m(0xff5a14, 0.05, 0, 0xff3300, 3.2);
    const lavaCore = m(0xffae3a, 0.04, 0, 0xff6a10, 4.4);

    // ── Body: two stacked truncated cones for a layered, slightly stepped profile.
    const midR = TOP_R + (BASE_R - TOP_R) * 0.45;
    const lowerH = HEIGHT * 0.45;
    const upperH = HEIGHT - lowerH;
    solid(g, G.cylinder(midR, BASE_R, lowerH, 14), basaltDark, 0, lowerH / 2);
    solid(g, G.cylinder(TOP_R, midR, upperH, 14), basalt, 0, lowerH + upperH / 2);

    // ── Crater rim + molten interior.
    solid(g, G.cylinder(TOP_R + 0.3, TOP_R - 0.1, LIP * 2, 14), ash, 0, HEIGHT + LIP * 0.5);
    deco(g, G.cylinder(TOP_R - 0.4, TOP_R - 0.4, 0.4, 16), lava, 0, HEIGHT + LIP * 0.2);
    deco(g, G.cylinder(TOP_R - 1.1, TOP_R - 1.1, 0.5, 16), lavaCore, 0, HEIGHT + LIP * 0.35);

    // ── Lava flows down the flanks. Each lives in its own azimuth sub-group so the
    // slope tilt composes cleanly. Slope tilt = angle of the cone surface.
    const slopeTilt = Math.atan2(BASE_R - TOP_R, HEIGHT); // from vertical
    const flowAngles = [0.3, 1.7, 2.9, 4.5, 5.6];
    for (let i = 0; i < flowAngles.length; i++) {
      const a = flowAngles[i]!;
      const flow = new THREE.Group();
      flow.rotation.y = a;
      // Box runs along its local Y; tilt it about Z to follow the slope, push it
      // out to the mean radius and lift to mid-height.
      const len = HEIGHT * 0.85;
      const meanR = (BASE_R + TOP_R) / 2 + 0.2;
      const ribbon = new THREE.Mesh(
        G.box(0.7 + (i % 2) * 0.3, len, 0.22),
        i % 2 === 0 ? lava : lavaCore,
      );
      ribbon.position.set(meanR, HEIGHT * 0.48, 0);
      ribbon.rotation.z = -slopeTilt;
      ribbon.userData.noCollision = true;
      flow.add(ribbon);
      g.add(flow);
    }

    // ── Solidified vents / spatter cones around the base.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const r = BASE_R + 0.6 + (i % 2) * 0.8;
      solid(g, G.cone(0.7 + (i % 3) * 0.25, 1.4 + (i % 2), 6), basaltDark,
        Math.cos(a) * r, 0.7, Math.sin(a) * r);
    }

    // ── Rising embers + ash plume from the crater.
    g.add(createEmberParticles({
      scale: 1, count: 34, radius: TOP_R - 0.8, baseY: HEIGHT + LIP,
      rise: 11.0, speed: 2.4, size: 0.55, color: 0xff6a1e,
    }));

    return g;
  }
}

registerMesh(Volcano);
