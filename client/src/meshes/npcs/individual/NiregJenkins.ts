import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class NiregJenkins extends Mesh {
  static readonly type = 'npc_individual_nireg_jenkins';
  static readonly category = 'npc' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = new THREE.Group();
    
    // Floating Oracle Eye
    const eyeGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, 
      emissive: 0x220055,
      roughness: 0.1 
    });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 2.0, 0);
    group.add(eye);

    // Pupil
    const pupilGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.45);
    eye.add(pupil);

    // Iris (Glowing)
    const irisGeo = new THREE.TorusGeometry(0.25, 0.05, 8, 16);
    const irisMat = new THREE.MeshStandardMaterial({ 
      color: 0xccff00, 
      emissive: 0x88ee00, 
      emissiveIntensity: 2.0 
    });
    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(0, 0, 0.4);
    eye.add(iris);

    // Floating Rings
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x8877aa, metalness: 0.8, roughness: 0.2 });
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.TorusGeometry(0.8 + i * 0.2, 0.02, 8, 32);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 2.0, 0);
      ring.rotation.set(Math.random(), Math.random(), Math.random());
      group.add(ring);
    }

    group.position.copy(ctx.position);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(NiregJenkins);
