import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// We import from 'three-mesh-bvh' if needed, but it's optional here.
import { meshTypes, buildMesh } from './meshes/index';

// ─── Setup Scene ─────────────────────────────────────────────────────────────

const container = document.getElementById('viewer')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// Grid & Axis
const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
scene.add(gridHelper);
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -20;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xccddff, 0.4);
fillLight.position.set(-20, 20, -20);
scene.add(fillLight);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 10, 20);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 5, 0);

// ─── Mesh Management ─────────────────────────────────────────────────────────

let currentMeshGroup: THREE.Group | undefined;

function loadMesh(type: string) {
  if (currentMeshGroup) {
    scene.remove(currentMeshGroup);
    currentMeshGroup = undefined;
  }

  if (!type) return;

  const buildContext = {
    position: new THREE.Vector3(0, 0, 0),
    scale: 1, // Default scale
  };

  const obj = buildMesh(type, buildContext);
  if (obj) {
    currentMeshGroup = new THREE.Group();
    currentMeshGroup.add(obj);

    // Add a simple shadow plane underneath
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.ShadowMaterial({ opacity: 0.5 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    currentMeshGroup.add(plane);

    scene.add(currentMeshGroup);
    console.info(`Loaded mesh: ${type}`);
  }
}

// ─── UI Setup ────────────────────────────────────────────────────────────────

const select = document.getElementById('meshSelect') as HTMLSelectElement;

// Populate dropdown with all registered meshes
const types = meshTypes();
types.sort().forEach((type) => {
  const option = document.createElement('option');
  option.value = type;
  option.textContent = type;
  select.appendChild(option);
});

select.addEventListener('change', (e) => {
  const target = e.target as HTMLSelectElement;
  loadMesh(target.value);
});

// Auto-load Malaka Church by default if it exists
if (types.includes('malaka_church')) {
  select.value = 'malaka_church';
  loadMesh('malaka_church');
}

// ─── Render Loop ─────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
