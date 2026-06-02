/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneManager } from './scene/SceneManager';
import { WorldManifest } from './state/WorldManifest';
import { WebSocketClient } from './network/WebSocketClient';
import { TerrainEditor, EditorMode } from './debug/TerrainEditor';
import { TerrainEditorPanel } from './ui/TerrainEditorPanel';
import { AssetLoader } from './utils/asset/AssetLoader';
import { EntityManager } from './entities/EntityManager';
import { CollisionSystem } from './systems/CollisionSystem';
import { WorldGenerator } from './systems/WorldGenerator';
import { WorldBuilder as WorldBuilderSystem } from './systems/WorldBuilder';
import { ZoneTracker } from './systems/ZoneTracker';
import { ZoneAtmosphere } from './systems/ZoneAtmosphere';
import { setWorldManifest as setTerrainManifest } from './scene/VerticalTerrain';
import { setWorldManifest as setBiomeManifest } from './scene/Biomes';

try {
  const app = document.getElementById('app')!;
  const worldManifest = new WorldManifest();

  const initEditor = async () => {
    const sceneManager = new SceneManager(app);
    const { scene, camera, renderer, terrain } = sceneManager;
    scene.background = new THREE.Color(0x0c101c);

    const terrainEditor = new TerrainEditor(scene, camera, renderer, terrain, worldManifest, null!, null!);
    const terrainEditorPanel = new TerrainEditorPanel(terrainEditor);
    terrainEditorPanel.showLoading('Hydrating Manifest...');

    await worldManifest.fetchAsync();
    setTerrainManifest(worldManifest);
    setBiomeManifest(worldManifest);
    terrain.setManifest(worldManifest.toData());
    terrain.init();

    const assetLoader = new AssetLoader();
    const entityManager = new EntityManager(scene, assetLoader);
    const collisionSystem = new CollisionSystem();
    const worldBuilderSystem = new WorldBuilderSystem(scene, terrain);
    const worldGenerator = new WorldGenerator(scene, terrain, entityManager, null!);
    
    worldGenerator.setCollisionSystem(collisionSystem);
    worldGenerator.setWorldManifest(worldManifest);
    worldGenerator.setWorldBuilder(worldBuilderSystem);

    const zoneTracker = new ZoneTracker();
    const zoneAtmosphere = new ZoneAtmosphere(scene, sceneManager.lighting.sun, sceneManager.lighting.hemisphere, sceneManager.lighting.ambient);

    (terrainEditor as any).assetLoader = assetLoader;
    (terrainEditor as any).entityManager = entityManager;
    (terrainEditor as any).ws = new WebSocketClient(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);

    terrain.onChunkLoaded = (cx, cz, wx, wz) => worldGenerator.onChunkLoaded(cx, cz, wx, wz);
    terrain.onChunkUnloaded = (cx, cz) => worldGenerator.onChunkUnloaded(cx, cz);

    camera.rotation.order = 'YXZ';
    let isFlyMode = false, yaw = 0, pitch = 0;
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true; orbitControls.dampingFactor = 0.05;
    camera.position.set(150, 80, 150); orbitControls.update();

    const syncFlyRot = () => { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); yaw = e.y; pitch = e.x; };
    const keys: Record<string, boolean> = {};
    window.addEventListener('keydown', (e) => { if (['INPUT','TEXTAREA'].includes((e.target as any).tagName)) return; keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    window.addEventListener('mousemove', (e) => {
      if (!isFlyMode || !(e.buttons & 3)) return;
      yaw -= e.movementX * 0.003; pitch -= e.movementY * 0.003;
      pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, pitch));
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    });

    const updateFlyMode = (delta: number) => {
      if (!isFlyMode) return;
      const speed = 180 * delta * (keys['ShiftLeft'] || keys['ShiftRight'] ? 6 : 1);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      if (keys['KeyW'] || keys['ArrowUp']) camera.position.addScaledVector(fwd, speed);
      if (keys['KeyS'] || keys['ArrowDown']) camera.position.addScaledVector(fwd, -speed);
      if (keys['KeyA'] || keys['ArrowLeft']) camera.position.addScaledVector(side, -speed);
      if (keys['KeyD'] || keys['ArrowRight']) camera.position.addScaledVector(side, speed);
      if (keys['KeyQ']) camera.position.y -= speed;
      if (keys['KeyE'] || keys['Space']) camera.position.y += speed;
    };

    const updateFlyHUD = () => {
      const btn = document.getElementById('toggle-fly');
      if (btn) { btn.textContent = isFlyMode ? 'FLY MODE: ON (V)' : 'ORBIT MODE (V)'; btn.style.background = isFlyMode ? 'rgba(197, 165, 90, 0.3)' : 'rgba(10, 8, 20, 0.85)'; }
    };

    document.getElementById('toggle-ui')?.addEventListener('click', () => terrainEditorPanel.toggle());
    document.getElementById('toggle-fly')?.addEventListener('click', () => { isFlyMode = !isFlyMode; orbitControls.enabled = !isFlyMode; if (isFlyMode) syncFlyRot(); updateFlyHUD(); });

    window.addEventListener('keydown', (e) => {
      if (['INPUT','TEXTAREA'].includes((e.target as any).tagName)) return;
      if (e.code === 'Escape') terrainEditor.setMode(EditorMode.OFF);
      if (e.code === 'KeyT') terrainEditorPanel.toggle();
      if (e.code === 'KeyF') { const p = (terrainEditor as any).cursor.position; if (isFlyMode) camera.lookAt(p); else { orbitControls.target.copy(p); orbitControls.update(); } }
      if (e.code === 'KeyH') { 
        const visible = document.getElementById('editor-hud')?.style.display !== 'none';
        ['editor-hud', 'terrain-editor-panel'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = visible ? 'none' : 'flex'; });
        terrainEditor.setLayerVisibility('features', !visible);
        terrainEditor.setLayerVisibility('zones', !visible);
        terrainEditor.setLayerVisibility('ui', !visible);
      }
      if (e.code === 'KeyV') { isFlyMode = !isFlyMode; orbitControls.enabled = !isFlyMode; if (isFlyMode) syncFlyRot(); updateFlyHUD(); if (!isFlyMode) { orbitControls.target.copy(new THREE.Vector3(0,0,-50).applyQuaternion(camera.quaternion).add(camera.position)); orbitControls.update(); } }
    });

    window.addEventListener('editor:manifest_changed', (e) => {
      terrain.setManifest(worldManifest.toData());
      worldGenerator.clearManifestItems();
      worldGenerator.setWorldManifest(worldManifest);
      // Refresh around the edited point when provided (so far-away placements
      // appear immediately), then also around the camera focus.
      const detail = (e as CustomEvent).detail as { x?: number; z?: number } | undefined;
      const fx = isFlyMode ? camera.position.x : orbitControls.target.x, fz = isFlyMode ? camera.position.z : orbitControls.target.z;
      if (detail && typeof detail.x === 'number' && typeof detail.z === 'number') {
        terrain.refreshAt(detail.x, detail.z, 150);
      }
      terrain.refreshAt(fx, fz, 250);
    });

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = Math.min(sceneManager.tick(), 0.1);
      terrainEditor.tick(delta);
      const fx = isFlyMode ? camera.position.x : orbitControls.target.x, fz = isFlyMode ? camera.position.z : orbitControls.target.z;
      worldGenerator.update(fx, fz);
      zoneTracker.update(fx, fz);
      zoneAtmosphere.enterZone(zoneTracker.getCurrentZone());
      zoneAtmosphere.update(delta);
      const info = document.getElementById('gen-info'); if (info) { const q = (worldGenerator as any).populator.queue.length; info.textContent = q > 0 ? `Generating: ${q} chunks...` : `World Ready`; }
      updateFlyMode(delta); if (!isFlyMode) orbitControls.update();
      terrain.update(fx, fz);
      sceneManager.setPlayerPosition(fx, fz);
    };

    (terrainEditor as any).ws.onConnectionChange = (c: boolean) => { if (c) (terrainEditor as any).ws.send({ type: 'join', username: 'Editor_'+Math.floor(Math.random()*1000), race: 'human', faction: 'alliance' }); };
    terrainEditorPanel.render(); terrainEditorPanel.show(); terrainEditor.refreshVisualization(); animate();
  };
  initEditor();
} catch (err) {
  console.error('Editor failed:', err);
}
