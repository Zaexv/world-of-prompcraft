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
import { meshTypes } from './meshes';

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
    (terrainEditor as any).worldBuilder = worldBuilderSystem;
    (terrainEditor as any).ws = new WebSocketClient(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`);

    terrain.onChunkLoaded = (cx, cz, wx, wz) => worldGenerator.onChunkLoaded(cx, cz, wx, wz);
    terrain.onChunkUnloaded = (cx, cz) => worldGenerator.onChunkUnloaded(cx, cz);

    // Load initial chunks AFTER callbacks wired — else preloaded chunks fire
    // onChunkLoaded into a null callback and spawn no objects/NPCs.
    terrain.init();
    
    // Save initial state for Undo/Redo
    (terrainEditor as any).saveState();

    camera.rotation.order = 'YXZ';
    let isFlyMode = false, yaw = 0, pitch = 0;
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true; orbitControls.dampingFactor = 0.05;
    camera.position.set(150, 80, 150); orbitControls.update();

    // Default to OFF (Camera Mode)
    terrainEditor.setMode(EditorMode.OFF);

    const syncFlyRot = () => { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); yaw = e.y; pitch = e.x; };
    const keys: Record<string, boolean> = {};
    (window as any).keys = keys;
    
    // Quick Search Modal Logic
    const searchOverlay = document.getElementById('search-overlay')!;
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const searchResults = document.getElementById('search-results')!;
    const searchTitle = document.getElementById('search-title')!;
    let searchContext: 'object' | 'npc' = 'object';
    let searchOptions: string[] = [];
    let searchSelectedIndex = 0;
    let currentFiltered: string[] = [];

    const closeSearch = () => {
      searchOverlay.style.display = 'none';
      searchInput.value = '';
    };

    const renderSearchResults = () => {
      const query = searchInput.value.toLowerCase();
      currentFiltered = searchOptions.filter(o => o.toLowerCase().includes(query));
      
      if (searchSelectedIndex >= currentFiltered.length) searchSelectedIndex = Math.max(0, currentFiltered.length - 1);

      searchResults.innerHTML = currentFiltered.map((o, idx) => `
        <li data-index="${idx}" data-val="${o}" style="padding:10px; cursor:pointer; border-bottom:1px solid #333; color:${idx === searchSelectedIndex ? '#c5a55a' : '#ddd'}; background:${idx === searchSelectedIndex ? '#111' : 'transparent'}">
          ${o.replace(/_/g, ' ')}
        </li>
      `).join('');

      // Add click listeners to items
      searchResults.querySelectorAll('li').forEach(li => {
        li.addEventListener('mousedown', (e) => {
          e.preventDefault(); // Prevents input from losing focus if needed
          const val = (e.currentTarget as HTMLElement).dataset.val;
          if (val) selectSearchResult(val);
        });
      });

      // Scroll into view if needed
      const activeEl = searchResults.querySelector(`li[data-index="${searchSelectedIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    };

    const selectSearchResult = (val: string) => {
      if (searchContext === 'object') {
        let cat = 'landmark';
        if (val.startsWith('encounter_')) cat = 'encounter';
        terrainEditor.setSelectedAsset(val, cat);
        terrainEditor.setMode(EditorMode.PLACE_OBJECT);
        // Sync UI
        const btn = document.querySelector('.te-mode[data-mode="place"]') as HTMLElement;
        if (btn) btn.click();
      } else {
        terrainEditor.setSelectedAsset(val, 'npc');
        terrainEditor.setMode(EditorMode.PLACE_NPC);
        // Sync UI
        const btn = document.querySelector('.te-mode[data-mode="npc"]') as HTMLElement;
        if (btn) btn.click();
      }
      closeSearch();
    };

    searchInput.addEventListener('input', () => {
      searchSelectedIndex = 0; // reset selection on type
      renderSearchResults();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (currentFiltered.length > 0) {
          selectSearchResult(currentFiltered[searchSelectedIndex]);
        }
      } else if (e.key === 'Escape') {
        closeSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchSelectedIndex = Math.min(currentFiltered.length - 1, searchSelectedIndex + 1);
        renderSearchResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchSelectedIndex = Math.max(0, searchSelectedIndex - 1);
        renderSearchResults();
      }
    });

    const openSearch = (type: 'object' | 'npc') => {
      searchContext = type;
      searchTitle.textContent = type === 'object' ? 'SEARCH OBJECTS' : 'SEARCH NPCS';
      
      if (type === 'npc') {
        searchOptions = [
          'civilian', 'merchant', 'guard', 'healer', 'sage', 'mage', 'pyromancer',
          'cryomancer', 'dragon', 'monster', 'spider', 'wasp', 'wolf', 'golem',
          'boar', 'orc', 'undead', 'oracle'
        ].sort();
      } else {
        searchOptions = meshTypes().sort();
      }
      
      searchSelectedIndex = 0;
      searchOverlay.style.display = 'block';
      searchInput.value = '';
      renderSearchResults();
      searchInput.focus();
    };


    window.addEventListener('keydown', (e) => { 
      // 1. Handle Search Overlay
      if (searchOverlay.style.display === 'block') {
        if (e.code === 'Escape') {
          closeSearch();
          e.preventDefault();
          e.stopPropagation();
        }
        // Do not allow other editor keys while search is open
        return;
      }

      // 2. Ignore input fields
      if (['INPUT','TEXTAREA'].includes((e.target as any).tagName)) return; 
      
      keys[e.code] = true; 
      
      // 3. Undo / Redo
      if (e.code === 'KeyZ' && e.ctrlKey) {
        e.preventDefault();
        if (e.shiftKey) (terrainEditor as any).redo();
        else (terrainEditor as any).undo();
        return;
      }
      if (e.code === 'KeyY' && e.ctrlKey) {
        e.preventDefault();
        (terrainEditor as any).redo();
        return;
      }

      // 4. Escape Logic (Close Help -> Deselect -> Revert to Select Mode)
      if (e.code === 'Escape') {
        const helpOverlay = document.getElementById('help-overlay');
        if (helpOverlay && helpOverlay.style.display === 'flex') {
          helpOverlay.style.display = 'none';
        } else if ((terrainEditor as any).selectedObject) {
          terrainEditor.deselectObject();
        } else if ((terrainEditor as any).mode !== EditorMode.OFF) {
          terrainEditor.setMode(EditorMode.MOVE_OBJECT);
          // Sync UI
          const moveBtn = document.querySelector('.te-mode[data-mode="move"]') as HTMLElement;
          if (moveBtn) moveBtn.click(); 
        }
        return;
      }

      // 5. Tool Modes
      if (e.code === 'Tab') {
        e.preventDefault();
        if ((terrainEditor as any).mode === EditorMode.OFF) {
          terrainEditor.setMode(EditorMode.MOVE_OBJECT);
          const moveBtn = document.querySelector('.te-mode[data-mode="move"]') as HTMLElement;
          if (moveBtn) moveBtn.click();
        } else {
          terrainEditor.setMode(EditorMode.OFF);
          const offBtn = document.querySelector('.te-mode[data-mode="off"]') as HTMLElement;
          if (offBtn) offBtn.click();
        }
      }

      if (e.code === 'Delete') {
        terrainEditor.deleteSelectedObject();
      }

      if (e.code === 'Digit1') { e.preventDefault(); openSearch('object'); }
      if (e.code === 'Digit2') { e.preventDefault(); openSearch('npc'); }
      if (e.code === 'Digit3') { 
        e.preventDefault(); 
        terrainEditor.setMode(EditorMode.PLACE_PATH);
        const btn = document.querySelector('.te-mode[data-mode="path"]') as HTMLElement;
        if (btn) btn.click();
      }
      if (e.code === 'Digit4') {
        e.preventDefault();
        const nextMode = (terrainEditor as any).mode === EditorMode.SCULPT_RAISE ? 'lower' : 'raise';
        const btn = document.querySelector(`.te-mode[data-mode="${nextMode}"]`) as HTMLElement;
        if (btn) btn.click();
      }
      if (e.code === 'Digit5') {
        e.preventDefault();
        const btn = document.querySelector('.te-mode[data-mode="flatten"]') as HTMLElement;
        if (btn) btn.click();
      }

      // 6. Camera & UI
      if (e.code === 'KeyT') terrainEditorPanel.toggle();
      if (e.code === 'KeyF') { const p = (terrainEditor as any).cursor.position; if (isFlyMode) camera.lookAt(p); else { orbitControls.target.copy(p); orbitControls.update(); } }
      if (e.code === 'KeyH') { 
        const hud = document.getElementById('editor-hud');
        const visible = hud?.style.display !== 'none';
        ['editor-hud', 'terrain-editor-panel'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = visible ? 'none' : 'flex'; });
        terrainEditor.setLayerVisibility('features', !visible);
        terrainEditor.setLayerVisibility('zones', !visible);
        terrainEditor.setLayerVisibility('ui', !visible);
      }
      if (e.code === 'KeyV') { isFlyMode = !isFlyMode; orbitControls.enabled = !isFlyMode; if (isFlyMode) syncFlyRot(); updateFlyHUD(); if (!isFlyMode) { orbitControls.target.copy(new THREE.Vector3(0,0,-50).applyQuaternion(camera.quaternion).add(camera.position)); orbitControls.update(); } }

      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); 
    });
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
