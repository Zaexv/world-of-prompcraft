import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

function makeOrbMaterial(colorA: THREE.ColorRepresentation, colorB: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormalDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 p = position;
        // Simplified vertex sway without requiring uTime update every frame
        // It won't animate unless uTime is hooked up, but it still looks like an orb.
        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalDir = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec3 vNormalDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 n = normalize(vNormalDir);
        float fresnel = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.2);
        float pulse = 0.55 + 0.45 * sin(uTime * 2.6 + vWorldPos.x * 0.06 + vWorldPos.z * 0.08);
        vec3 color = mix(uColorA, uColorB, pulse);
        color += fresnel * vec3(0.18, 0.42, 0.65);
        float alpha = 0.72 + fresnel * 0.22;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

export class ForestOrb extends Mesh {
  static readonly type = 'biome_prop_forest_orb';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Mesh {
    const s = ctx.scale;
    const orbGeo = new THREE.SphereGeometry(0.55 * s, 16, 16);
    // Randomize colors slightly based on position
    const outerMat = makeOrbMaterial(0x76b8ff, 0x8d44ff);
    const innerMat = makeOrbMaterial(0xe7fbff, 0x76ffd0);
    const useOuter = (ctx.position.x + ctx.position.z) % 2 > 0;
    
    const orb = new THREE.Mesh(orbGeo, useOuter ? outerMat : innerMat);
    orb.position.copy(ctx.position);
    orb.position.y += 1.5 * s; // Float above ground
    orb.castShadow = false;
    orb.receiveShadow = false;
    orb.userData.noCollision = true;
    return orb;
  }
}

registerMesh(ForestOrb);
