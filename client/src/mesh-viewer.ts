import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { meshTypes, buildMesh } from './meshes/index';

// ─── Category helpers ─────────────────────────────────────────────────────────

type TabId = 'all' | 'building' | 'prop' | 'vegetation' | 'encounter' | 'npc' | 'player';

const buildingSet = new Set(meshTypes('building'));
const vegSet      = new Set(meshTypes('vegetation'));
const npcSet      = new Set(meshTypes('npc'));
const playerSet   = new Set(meshTypes('player'));

function tabFor(type: string): Exclude<TabId, 'all'> {
  if (type.startsWith('encounter_')) return 'encounter';
  if (buildingSet.has(type)) return 'building';
  if (vegSet.has(type)) return 'vegetation';
  if (npcSet.has(type)) return 'npc';
  if (playerSet.has(type)) return 'player';
  return 'prop';
}

const allTypes = meshTypes().sort();

// ─── Thumbnail renderer (offscreen) ──────────────────────────────────────────

const thumbScene = new THREE.Scene();
thumbScene.background = new THREE.Color(0x1a1a2e);
thumbScene.add(new THREE.AmbientLight(0xffffff, 0.7));
const td1 = new THREE.DirectionalLight(0xffeedd, 1.4);
td1.position.set(10, 20, 10);
thumbScene.add(td1);
const td2 = new THREE.DirectionalLight(0xccddff, 0.3);
td2.position.set(-10, 10, -10);
thumbScene.add(td2);

const thumbCam = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
const thumbRend = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
thumbRend.setSize(200, 200);
thumbRend.setPixelRatio(1);

let _thumbObj: THREE.Object3D | null = null;

function renderThumbnail(type: string): { url: string; bboxSize: THREE.Vector3 } {
  if (_thumbObj) { thumbScene.remove(_thumbObj); _thumbObj = null; }

  const obj = buildMesh(type, { position: new THREE.Vector3(), scale: 1 });
  const bboxSize = new THREE.Vector3(1, 1, 1);

  if (obj) {
    _thumbObj = obj;
    thumbScene.add(_thumbObj);

    const bbox = new THREE.Box3().setFromObject(obj);
    bbox.getSize(bboxSize);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z) || 1;
    const fov = thumbCam.fov * (Math.PI / 180);
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 2.5;

    thumbCam.position.set(
      center.x + dist * 0.65,
      center.y + dist * 0.45,
      center.z + dist * 0.85,
    );
    thumbCam.lookAt(center);
    thumbCam.near = Math.max(0.001, dist * 0.01);
    thumbCam.far  = dist * 20;
    thumbCam.updateProjectionMatrix();
  }

  thumbRend.render(thumbScene, thumbCam);
  return { url: thumbRend.domElement.toDataURL('image/jpeg', 0.82), bboxSize: bboxSize.clone() };
}

// ─── Main 3D scene (solo orbit view) ──────────────────────────────────────────

const viewerEl = document.getElementById('viewer')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.add(new THREE.GridHelper(50, 50, 0x444444, 0x222222));
scene.add(new THREE.AxesHelper(5));
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near   = 0.5;
dirLight.shadow.camera.far    = 100;
dirLight.shadow.camera.left   = -20;
dirLight.shadow.camera.right  = 20;
dirLight.shadow.camera.top    = 20;
dirLight.shadow.camera.bottom = -20;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xccddff, 0.4);
fillLight.position.set(-20, 20, -20);
scene.add(fillLight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 10, 20);

// preserveDrawingBuffer lets fixer mode read the rendered frame back via toDataURL.
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 5, 0);
controls.enabled = false;

let currentMesh: THREE.Object3D | null = null;

function loadMeshSolo(type: string, bboxSize: THREE.Vector3): void {
  if (currentMesh) { scene.remove(currentMesh); currentMesh = null; }

  const obj = buildMesh(type, { position: new THREE.Vector3(), scale: 1 });
  if (!obj) return;

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.ShadowMaterial({ opacity: 0.5 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;

  const group = new THREE.Group();
  group.add(obj, plane);
  currentMesh = group;
  scene.add(currentMesh);

  // Fit camera to mesh
  const bbox = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z) || 1;
  const dist = maxDim * 2.5;
  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.55, center.z + dist * 0.9);
  controls.target.copy(center);
  controls.update();
}

// ─── UI state ─────────────────────────────────────────────────────────────────

const gridOverlay  = document.getElementById('gridOverlay')!;
const soloHeader   = document.getElementById('soloHeader')!;
const meshGrid     = document.getElementById('meshGrid')!;
const tabBar       = document.getElementById('tabBar')!;
const searchInput  = document.getElementById('searchInput') as HTMLInputElement;
const backToGrid   = document.getElementById('backToGrid')!;
const soloTitle    = document.getElementById('soloTitle')!;
const soloBbox     = document.getElementById('soloBbox')!;

let activeTab: TabId  = 'all';
let searchQuery       = '';
let inSoloMode        = false;
let currentType       = '';

const bboxMap = new Map<string, THREE.Vector3>();
const tileMap = new Map<string, HTMLElement>();

// ─── Grid ─────────────────────────────────────────────────────────────────────

function buildGrid(): void {
  for (const type of allTypes) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.type = type;
    tile.dataset.tabGroup = tabFor(type);

    const placeholder = document.createElement('div');
    placeholder.className = 'tile-placeholder';
    placeholder.textContent = '…';

    const info = document.createElement('div');
    info.className = 'tile-info';

    const typeEl = document.createElement('div');
    typeEl.className = 'tile-type';
    typeEl.textContent = type;

    const bboxEl = document.createElement('div');
    bboxEl.className = 'tile-bbox';

    info.append(typeEl, bboxEl);
    tile.append(placeholder, info);
    tile.addEventListener('click', () => onTileClick(type));
    meshGrid.appendChild(tile);
    tileMap.set(type, tile);
  }

  // Update tab counts
  const counts: Record<string, number> = { all: allTypes.length, building: 0, prop: 0, vegetation: 0, encounter: 0, npc: 0, player: 0 };
  for (const type of allTypes) counts[tabFor(type)]++;
  for (const btn of tabBar.querySelectorAll<HTMLElement>('[data-tab]')) {
    const tab = btn.dataset.tab as TabId;
    if (tab && counts[tab] !== undefined) {
      btn.textContent = `${btn.textContent?.replace(/ \(\d+\)$/, '')} (${counts[tab]})`;
    }
  }

  filterGrid();
}

function filterGrid(): void {
  const query = searchQuery.toLowerCase();
  for (const [type, tile] of tileMap) {
    const tabMatch = activeTab === 'all' || tile.dataset.tabGroup === activeTab;
    const searchMatch = !query || type.includes(query);
    tile.classList.toggle('hidden', !(tabMatch && searchMatch));
  }
}

function onTileClick(type: string): void {
  const bboxSize = bboxMap.get(type) ?? new THREE.Vector3(1, 1, 1);
  enterSoloMode(type, bboxSize);
}

function enterSoloMode(type: string, bboxSize: THREE.Vector3): void {
  inSoloMode = true;
  currentType = type;
  gridOverlay.style.display = 'none';
  soloHeader.style.display = 'flex';
  soloTitle.textContent = type;
  const { x, y, z } = bboxSize;
  soloBbox.textContent = `${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)}`;
  controls.enabled = true;
  loadMeshSolo(type, bboxSize);
}

function exitSoloMode(): void {
  exitFixerMode();
  inSoloMode = false;
  gridOverlay.style.display = 'flex';
  soloHeader.style.display = 'none';
  controls.enabled = false;
}

// ─── Fixer mode (highlight a broken region → save capture) ─────────────────────

const fixBtn      = document.getElementById('fixBtn')!;
const fixOverlay  = document.getElementById('fixOverlay')!;
const fixRect     = document.getElementById('fixRect') as HTMLElement;
const fixHint     = document.getElementById('fixHint')!;
const saveDialog  = document.getElementById('saveDialog')!;
const savePreview = document.getElementById('savePreview') as HTMLImageElement;
const saveName    = document.getElementById('saveName') as HTMLInputElement;
const saveStatus  = document.getElementById('saveStatus')!;
const saveCancel  = document.getElementById('saveCancel')!;
const saveConfirm = document.getElementById('saveConfirm')!;

let fixerActive = false;
let dragging    = false;
const dragStart = { x: 0, y: 0 };
let capturedDataUrl = '';

function enterFixerMode(): void {
  if (!inSoloMode) return;
  fixerActive = true;
  fixBtn.classList.add('active');
  // Freeze the camera so the highlighted region stays put while drawing.
  controls.enabled = false;
  fixOverlay.style.display = 'block';
  fixHint.style.display = 'block';
}

function exitFixerMode(): void {
  fixerActive = false;
  dragging = false;
  fixBtn.classList.remove('active');
  fixOverlay.style.display = 'none';
  fixHint.style.display = 'none';
  fixRect.style.display = 'none';
  if (inSoloMode) controls.enabled = true;
}

fixBtn.addEventListener('click', () => {
  if (fixerActive) exitFixerMode();
  else enterFixerMode();
});

fixOverlay.addEventListener('mousedown', (e) => {
  dragging = true;
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
  fixRect.style.left = `${e.clientX}px`;
  fixRect.style.top = `${e.clientY}px`;
  fixRect.style.width = '0px';
  fixRect.style.height = '0px';
  fixRect.style.display = 'block';
});

fixOverlay.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const x = Math.min(e.clientX, dragStart.x);
  const y = Math.min(e.clientY, dragStart.y);
  const w = Math.abs(e.clientX - dragStart.x);
  const h = Math.abs(e.clientY - dragStart.y);
  fixRect.style.left = `${x}px`;
  fixRect.style.top = `${y}px`;
  fixRect.style.width = `${w}px`;
  fixRect.style.height = `${h}px`;
});

window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const x = Math.min(e.clientX, dragStart.x);
  const y = Math.min(e.clientY, dragStart.y);
  const w = Math.abs(e.clientX - dragStart.x);
  const h = Math.abs(e.clientY - dragStart.y);
  if (w < 6 || h < 6) { fixRect.style.display = 'none'; return; }
  openSaveDialog(buildCapture(x, y, w, h));
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (saveDialog.style.display === 'flex') closeSaveDialog();
    else if (fixerActive) exitFixerMode();
  }
});

// Composite the rendered frame + red highlight + mesh name into a PNG data URL.
// Selection coords are CSS px (clientX/Y); scale to the renderer's drawing buffer.
function buildCapture(cssX: number, cssY: number, cssW: number, cssH: number): string {
  renderer.render(scene, camera);
  const gl = renderer.domElement;
  const scale = gl.width / window.innerWidth;

  const cv = document.createElement('canvas');
  cv.width = gl.width;
  cv.height = gl.height;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(gl, 0, 0);

  const rx = cssX * scale;
  const ry = cssY * scale;
  const rw = cssW * scale;
  const rh = cssH * scale;
  ctx.fillStyle = 'rgba(255,45,45,0.12)';
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeStyle = '#ff2d2d';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.strokeRect(rx, ry, rw, rh);

  // Mesh name label, top-left.
  const fontPx = Math.round(20 * scale);
  ctx.font = `600 ${fontPx}px 'SF Mono', Consolas, monospace`;
  const label = currentType;
  const pad = 8 * scale;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(13,17,23,0.85)';
  ctx.fillRect(pad, pad, tw + pad * 2, fontPx + pad * 1.2);
  ctx.fillStyle = '#f0f6fc';
  ctx.textBaseline = 'top';
  ctx.fillText(label, pad * 2, pad * 1.5);

  return cv.toDataURL('image/png');
}

function defaultFixName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${currentType}-fix-${ts}`;
}

function openSaveDialog(dataUrl: string): void {
  capturedDataUrl = dataUrl;
  savePreview.src = dataUrl;
  saveName.value = defaultFixName();
  saveStatus.textContent = '';
  saveStatus.className = '';
  saveDialog.style.display = 'flex';
  saveName.focus();
  saveName.select();
}

function closeSaveDialog(): void {
  saveDialog.style.display = 'none';
  fixRect.style.display = 'none';
}

saveCancel.addEventListener('click', closeSaveDialog);

saveConfirm.addEventListener('click', async () => {
  const filename = saveName.value.trim() || defaultFixName();
  saveStatus.textContent = 'Saving…';
  saveStatus.className = '';
  try {
    const res = await fetch('/__save-mesh-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, dataUrl: capturedDataUrl }),
    });
    const json = (await res.json()) as { ok: boolean; path?: string; error?: string };
    if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    saveStatus.textContent = `Saved → ${json.path}`;
    saveStatus.className = 'ok';
    setTimeout(closeSaveDialog, 1500);
  } catch (err) {
    saveStatus.textContent = `Failed: ${String(err)}`;
    saveStatus.className = 'err';
  }
});

// ─── Thumbnail generation ─────────────────────────────────────────────────────

async function startThumbnails(): Promise<void> {
  const BATCH = 5;
  for (let i = 0; i < allTypes.length; i += BATCH) {
    const batch = allTypes.slice(i, i + BATCH);
    for (const type of batch) {
      const { url, bboxSize } = renderThumbnail(type);
      bboxMap.set(type, bboxSize);

      const tile = tileMap.get(type);
      if (tile) {
        const placeholder = tile.querySelector('.tile-placeholder');
        if (placeholder) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = type;
          tile.replaceChild(img, placeholder);
        }
        const bboxEl = tile.querySelector<HTMLElement>('.tile-bbox');
        if (bboxEl) {
          const { x, y, z } = bboxSize;
          bboxEl.textContent = `${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)}`;
        }
      }
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

tabBar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab as TabId;
  for (const t of tabBar.querySelectorAll<HTMLElement>('.tab')) t.classList.remove('active');
  btn.classList.add('active');
  filterGrid();
});

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  filterGrid();
});

backToGrid.addEventListener('click', exitSoloMode);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Render loop ──────────────────────────────────────────────────────────────

function animate(): void {
  requestAnimationFrame(animate);
  if (inSoloMode) {
    controls.update();
    renderer.render(scene, camera);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

buildGrid();
animate();
void startThumbnails();
