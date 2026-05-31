import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';

function makeLanternGlowTex(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0.0, 'rgba(255,220,100,0.90)');
  grad.addColorStop(0.2, 'rgba(255,180, 60,0.55)');
  grad.addColorStop(0.5, 'rgba(255,140, 20,0.18)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class Lantern extends Mesh {
  static readonly type = 'lantern';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.4, metalness: 0.7 });
    // Overbright emissive — pushes above the UnrealBloomPass threshold so it blooms
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: new THREE.Color(0xffcc44).multiplyScalar(3.0),
      emissiveIntensity: 1.0,
    });

    const postGeo = new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 3 * scale, 6);
    const post = new THREE.Mesh(postGeo, metalMat);
    post.position.y = 1.5 * scale;
    post.castShadow = true;
    post.userData.isCollider = true;
    g.add(post);

    const houseGeo = new THREE.BoxGeometry(0.4 * scale, 0.5 * scale, 0.4 * scale);
    const house = new THREE.Mesh(houseGeo, metalMat);
    house.position.y = 3.25 * scale;
    house.userData.noCollision = true;
    g.add(house);

    const coreGeo = new THREE.SphereGeometry(0.15 * scale, 6, 6);
    const core = new THREE.Mesh(coreGeo, lightMat);
    core.position.y = 3.25 * scale;
    core.userData.noCollision = true;
    g.add(core);

    // Gaussian glow halo — additive sprite gives the visible radial falloff
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeLanternGlowTex(),
        color: new THREE.Color(2.5, 1.8, 0.5),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        transparent: true,
      }),
    );
    glow.scale.set(3 * scale, 3 * scale, 1);
    glow.position.y = 3.25 * scale;
    glow.userData.noCollision = true;
    g.add(glow);

    // Point light — illuminates surroundings in all directions
    const light = new THREE.PointLight(0xffcc44, 4.0, 9 * scale, 2);
    light.position.y = 3.25 * scale;
    light.castShadow = false;
    g.add(light);

    return g;
  }
}

registerMesh(Lantern);
