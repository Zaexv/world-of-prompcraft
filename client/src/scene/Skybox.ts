import * as THREE from 'three';

/**
 * Procedural sky with a brilliant sun and Minecraft-like blocky clouds.
 */
export class Skybox {
  private cloudMesh: THREE.Mesh | null = null;
  private sunMesh: THREE.Group | null = null;
  private skyDome: THREE.Mesh | null = null;
constructor(scene: THREE.Scene) {

  // 1. Sky Color (Lighter, more vibrant)
  const skyColor = 0x88d0ff;
  scene.background = new THREE.Color(skyColor);
  scene.environment = null;

  // Radius must be < 1600 so it doesn't get culled by the camera's far plane!
  // Optimized: Reduced segments from 32,15 to 16,8. It's a sky dome, it doesn't need high geo.
  const skyGeo = new THREE.SphereGeometry(1400, 16, 8);
  const skyMat = new THREE.MeshBasicMaterial({ 
    color: skyColor, 
    side: THREE.BackSide, 
    fog: false,
    depthWrite: false
  });
  this.skyDome = new THREE.Mesh(skyGeo, skyMat);
  this.skyDome.renderOrder = -1; // Render behind everything else
  this.skyDome.frustumCulled = false;
  scene.add(this.skyDome);

  // 2. Minecraft-like Clouds
  // ... (rest of clouds logic)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    ctx.clearRect(0, 0, 512, 512);
    
    // Generate blocky noise
    const blockSize = 16; 
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'; // Even more transparent
    for (let y = 0; y < 512; y += blockSize) {
      for (let x = 0; x < 512; x += blockSize) {
        const noise = Math.sin(x * 0.03) * Math.cos(y * 0.03) + 
                      Math.sin(x * 0.015 - y * 0.01);
        if (noise > 0.95) { // Even sparser clouds
          ctx.fillRect(x, y, blockSize, blockSize);
        }
      }
    }
    
    const cloudTex = new THREE.CanvasTexture(canvas);
    cloudTex.magFilter = THREE.NearestFilter; 
    cloudTex.minFilter = THREE.NearestFilter;
    cloudTex.wrapS = THREE.RepeatWrapping;
    cloudTex.wrapT = THREE.RepeatWrapping;
    cloudTex.repeat.set(12, 12); 
    
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      opacity: 0.7,
      fog: false 
    });
    
    // Large plane for clouds
    const cloudGeo = new THREE.PlaneGeometry(12000, 12000);
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.cloudMesh.rotation.x = -Math.PI / 2;
    this.cloudMesh.position.y = 500; // Raised clouds even higher to get out of the way
    this.cloudMesh.frustumCulled = false; // Disable culling for massive meshes
    scene.add(this.cloudMesh);
  }

  update(delta: number, playerX: number, playerZ: number) {
    if (this.skyDome) {
      this.skyDome.position.set(playerX, 0, playerZ);
    }

    if (this.cloudMesh) {
      this.cloudMesh.position.x = playerX;
      this.cloudMesh.position.z = playerZ;

      const mat = this.cloudMesh.material as THREE.MeshBasicMaterial;
      if (mat.map) {
        mat.map.offset.x += 0.015 * delta;
        mat.map.offset.y += 0.008 * delta;
      }
    }

    if (this.sunMesh) {
      // Keep sun relative to player, matching the Lighting.ts direction
      // Lowered the sun's Y component (120 instead of 300) so it's closer to the horizon
      const dist = 1200;
      const dir = new THREE.Vector3(200, 120, -200).normalize();
      this.sunMesh.position.set(
        playerX + dir.x * dist,
        dir.y * dist,
        playerZ + dir.z * dist
      );
    }
  }
}
