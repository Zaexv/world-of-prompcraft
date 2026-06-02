import * as THREE from 'three';
import { Terrain } from '../scene/Terrain';
import { WorldManifest, LandmarkDefinition, VerticalPlace, NPCDefinition } from '../state/WorldManifest';
import { WebSocketClient } from '../network/WebSocketClient';
import { buildObject } from '../systems/worldbuilder/objects';
import { NPC } from '../entities/NPC';
import { AssetLoader } from '../utils/asset/AssetLoader';

export enum EditorMode {
  OFF,
  SCULPT_RAISE,
  SCULPT_LOWER,
  PLACE_OBJECT,
  REMOVE_OBJECT,
  MOVE_OBJECT,
  PLACE_NPC,
  PLACE_PATH
}

export class TerrainEditor {
  private mode: EditorMode = EditorMode.OFF;
  private brushRadius = 15;
  private brushIntensity = 5;
  private selectedType: string = 'pavilion';
  
  private cursor: THREE.Group;
  private brushMesh: THREE.Mesh;
  private previewMesh: THREE.Object3D | null = null;
  
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private lastIntersection: THREE.Intersection | null = null;
  
  private isMouseDown = false;
  private lastSculptTime = 0;
  private readonly SCULPT_INTERVAL = 100; // ms

  // Visualization Layers
  private layerFeatures = new THREE.Group();
  private layerPaths = new THREE.Group();
  private layerZones = new THREE.Group();
  
  // Selection State
  private selectedObject: { id: string, type: string, group: THREE.Object3D } | null = null;
  private pathStart: THREE.Vector3 | null = null;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private renderer: THREE.Renderer,
    private terrain: Terrain,
    private worldManifest: WorldManifest,
    private ws: WebSocketClient,
    private assetLoader?: AssetLoader
  ) {
    this.cursor = new THREE.Group();
    this.cursor.visible = false;
    this.scene.add(this.cursor);

    const geometry = new THREE.RingGeometry(this.brushRadius - 0.5, this.brushRadius, 64);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, depthWrite: false });
    this.brushMesh = new THREE.Mesh(geometry, material);
    this.cursor.add(this.brushMesh);

    this.scene.add(this.layerFeatures);
    this.scene.add(this.layerPaths);
    this.scene.add(this.layerZones);

    this.setupListeners();
    this.refreshVisualization();
  }

  private setupListeners(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (this.mode === EditorMode.OFF) return;
      if (e.button === 0) {
        this.isMouseDown = true;
        const pos = this.lastIntersection?.point;
        if (!pos) return;

        switch (this.mode) {
          case EditorMode.PLACE_OBJECT: this.placeObject(pos); break;
          case EditorMode.REMOVE_OBJECT: this.removeObjectAt(pos); break;
          case EditorMode.MOVE_OBJECT: 
            if (this.selectedObject) this.dropObject(pos);
            else this.pickObject(pos);
            break;
          case EditorMode.PLACE_NPC: this.placeNPC(pos); break;
          case EditorMode.PLACE_PATH: this.placePathPoint(pos); break;
        }
      }
    });

    window.addEventListener('mouseup', () => { this.isMouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => { if (this.mode !== EditorMode.OFF) e.preventDefault(); });
  }

  public setMode(mode: EditorMode): void {
    this.mode = mode;
    this.cursor.visible = mode !== EditorMode.OFF;
    if (this.selectedObject && mode !== EditorMode.MOVE_OBJECT) this.deselectObject();
    this.updatePreview();
    if (this.brushMesh.material instanceof THREE.MeshBasicMaterial) {
      const colors = [0xffff00, 0x00ff00, 0xff0000, 0x00ffff, 0xff00ff, 0xffaa00, 0xaa00ff, 0xffffff];
      this.brushMesh.material.color.set(colors[mode] || 0xffff00);
    }
  }

  public setLayerVisibility(layer: string, visible: boolean): void {
    if (layer === 'features') this.layerFeatures.visible = visible;
    if (layer === 'paths') this.layerPaths.visible = visible;
    if (layer === 'zones') this.layerZones.visible = visible;
    if (layer === 'ui') this.cursor.visible = visible && this.mode !== EditorMode.OFF;
  }

  public tick(delta: number): void {
    this.updateCursor();
    const em = (this as any).entityManager;
    if (em) {
      em.npcs.forEach((npc: any) => {
        if (!npc.isBeingMoved) {
          npc.mesh.position.y = this.terrain.getHeightAt(npc.position.x, npc.position.z);
        }
        npc.update(delta);
      });
    }
  }

  public refreshVisualization(): void {
    this.clearLayer(this.layerFeatures);
    this.clearLayer(this.layerPaths);
    this.clearLayer(this.layerZones);

    for (const f of this.worldManifest.getTerrainFeatures()) {
      const g = this.createFeatureGizmo(f);
      g.userData = { editorId: f.id, editorType: 'feature' };
      this.layerFeatures.add(g);
    }

    const paths = this.worldManifest.getPaths();
    paths.forEach((path, i) => {
      const start = new THREE.Vector3(path.start[0], this.terrain.getHeightAt(path.start[0], path.start[1]) + 0.2, path.start[1]);
      const end = new THREE.Vector3(path.end[0], this.terrain.getHeightAt(path.end[0], path.end[1]) + 0.2, path.end[1]);
      const dir = end.clone().sub(start);
      const geo = new THREE.PlaneGeometry(path.width, dir.length());
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x5d4037, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }));
      mesh.position.copy(start).add(dir.multiplyScalar(0.5));
      mesh.lookAt(end); mesh.rotateY(Math.PI / 2);
      mesh.userData = { editorId: `path_${i}`, editorType: 'path' };
      this.layerPaths.add(mesh);
    });

    for (const [_, z] of this.worldManifest.getZones()) {
      const w = z.bounds.max[0] - z.bounds.min[0], d = z.bounds.max[1] - z.bounds.min[1];
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.1 }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(z.bounds.min[0] + w/2, 0.1, z.bounds.min[1] + d/2);
      this.layerZones.add(mesh);
    }
  }

  private clearLayer(l: THREE.Group): void {
    while (l.children.length > 0) {
      const c = l.children[0]; l.remove(c);
      c.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    }
  }

  private createFeatureGizmo(f: VerticalPlace): THREE.Object3D {
    const g = new THREE.Group();
    g.position.set(f.transform.x, this.terrain.getHeightAt(f.transform.x, f.transform.z) + 0.5, f.transform.z);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true });
    if (f.shape === 'rect') {
      const w = f.width ?? (f.radii.inner * 2), d = f.depth ?? (f.radii.inner * 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI/2), mat);
      if (f.transform.rotation) m.rotation.y = f.transform.rotation;
      g.add(m);
    } else {
      g.add(new THREE.Mesh(new THREE.CircleGeometry(f.radii.inner, 32).rotateX(-Math.PI/2), mat));
    }
    return g;
  }

  public setBrushRadius(r: number): void { this.brushRadius = r; this.brushMesh.scale.setScalar(r / 15); }
  public setBrushIntensity(i: number): void { this.brushIntensity = i; }
  public setSelectedAsset(t: string, _: string): void { this.selectedType = t; this.updatePreview(); }

  private updatePreview(): void {
    if (this.previewMesh) { this.cursor.remove(this.previewMesh); this.previewMesh = null; }
    if (this.mode === EditorMode.PLACE_OBJECT) {
      this.previewMesh = buildObject(this.selectedType, new THREE.Vector3(0,0,0), 1);
    } else if (this.mode === EditorMode.PLACE_NPC) {
      this.previewMesh = NPC.create({ id: 'preview', name: 'Preview', position: new THREE.Vector3(0,0,0), style: this.selectedType as any }, this.assetLoader).mesh;
    }
    if (this.previewMesh) {
      this.previewMesh.traverse(o => { if (o instanceof THREE.Mesh) { o.material = (o.material as THREE.Material).clone(); (o.material as any).transparent = true; (o.material as any).opacity = 0.5; (o.material as any).depthWrite = false; } });
      this.cursor.add(this.previewMesh);
    }
  }

  private updateCursor(): void {
    if (this.mode === EditorMode.OFF) return;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const ground: THREE.Mesh[] = [];
    (this.terrain as any).chunks.forEach((c: any) => { if (c.mesh) ground.push(c.mesh); });
    const hits = this.raycaster.intersectObjects(ground);
    if (hits.length > 0) {
      this.lastIntersection = hits[0];
      const p = hits[0].point;
      this.cursor.position.copy(p); this.cursor.position.y += 0.2; this.cursor.visible = true;
      if (this.mode === EditorMode.MOVE_OBJECT && this.selectedObject && this.isMouseDown) {
        this.selectedObject.group.position.copy(p);
        if (this.selectedObject.type === 'npc') {
          const npc = (this as any).entityManager?.npcs.get(this.selectedObject.id);
          if (npc) { npc.position.copy(p); npc.homePosition.copy(p); npc.isBeingMoved = true; }
        }
      }
      if (this.isMouseDown && (this.mode === EditorMode.SCULPT_RAISE || this.mode === EditorMode.SCULPT_LOWER)) this.handleAction();
    } else {
      this.lastIntersection = null; this.cursor.visible = false;
    }
  }

  private handleAction(): void {
    if (!this.lastIntersection) return;
    const now = performance.now();
    if (now - this.lastSculptTime > this.SCULPT_INTERVAL) {
      this.sculptTerrain(this.lastIntersection.point, this.mode === EditorMode.SCULPT_RAISE ? 1 : -1);
      this.lastSculptTime = now;
    }
  }

  private pickObject(pos: THREE.Vector3): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    if (hits.length > 0) {
      let root = hits[0].object;
      while (root.parent && !root.userData.editorId && root.parent !== this.scene) root = root.parent;
      if (root.userData.editorId) {
        this.selectedObject = { id: root.userData.editorId, type: root.userData.editorType, group: root };
        this.applyHighlight(root);
        window.dispatchEvent(new CustomEvent('editor:select', { detail: this.selectedObject }));
      }
    }
  }

  private dropObject(pos: THREE.Vector3): void {
    if (!this.selectedObject) return;
    const id = this.selectedObject.id, type = this.selectedObject.type, p: [number,number,number] = [pos.x, pos.y, pos.z];
    if (type === 'building') {
      const l = this.worldManifest.getAllLandmarks().find(l => l.id === id); if (l) l.transform.position = p;
    } else if (type === 'npc') {
      const n = this.worldManifest.getNPCs().find(n => n.id === id); if (n) n.transform.position = p;
      const npc = (this as any).entityManager?.npcs.get(id); if (npc) npc.isBeingMoved = false;
    } else if (type === 'feature') {
      const f = this.worldManifest.getTerrainFeatures().find(f => f.id === id); if (f) { f.transform.x = pos.x; f.transform.z = pos.z; }
    }
    this.deselectObject();
    window.dispatchEvent(new CustomEvent('editor:manifest_changed'));
    this.refreshVisualization();
  }

  private deselectObject(): void {
    if (this.selectedObject) {
      this.selectedObject.group.traverse(o => { if (o instanceof THREE.Mesh && o.userData.origMat) o.material = o.userData.origMat; });
      this.selectedObject = null;
      window.dispatchEvent(new CustomEvent('editor:select', { detail: null }));
    }
  }

  private applyHighlight(o: THREE.Object3D): void {
    o.traverse(c => { if (c instanceof THREE.Mesh) { if (!c.userData.origMat) c.userData.origMat = c.material; const h = (c.material as THREE.Material).clone(); (h as any).emissive = new THREE.Color(0x443300); c.material = h; } });
  }

  private sculptTerrain(pos: THREE.Vector3, dir: number): void {
    const fs = this.worldManifest.getTerrainFeatures();
    const f = fs.find(f => Math.hypot(f.transform.x - pos.x, f.transform.z - pos.z) < this.brushRadius / 2);
    if (f) f.height += dir * (this.brushIntensity / 10);
    else fs.push({ id: `sculpt_${Date.now()}`, type: 'flat_patch', transform: { x: pos.x, z: pos.z }, radii: { inner: this.brushRadius*0.5, outer: this.brushRadius }, height: this.terrain.getHeightAt(pos.x, pos.z) + dir*(this.brushIntensity/10), shape: 'circle' });
    this.terrain.setManifest(this.getManifestData());
    this.terrain.refreshAt(pos.x, pos.z, this.brushRadius + 20);
    this.refreshVisualization();
  }

  private placeObject(pos: THREE.Vector3): void {
    const zones = this.worldManifest.getZones();
    let zid = 'teldrassil_central';
    for (const [id, z] of zones) if (pos.x >= z.bounds.min[0] && pos.x <= z.bounds.max[0] && pos.z >= z.bounds.min[1] && pos.z <= z.bounds.max[1]) { zid = id; break; }
    const z = zones.get(zid); if (!z) return;
    
    if (!z.architecture) z.architecture = { landmarks: [], paths: [], dungeons: {} };
    if (!z.architecture.landmarks) z.architecture.landmarks = [];
    
    const l: LandmarkDefinition = { id: `${this.selectedType}_${Date.now()}`, type: this.selectedType, transform: { position: [pos.x, 0, pos.z], scale: 1, rotation: [0, 0, 0] }, visual: { label: this.selectedType } };
    z.architecture.landmarks.push(l); this.worldManifest.addLandmark(l);
    window.dispatchEvent(new CustomEvent('editor:manifest_changed'));
    this.refreshVisualization();
  }

  private removeObjectAt(pos: THREE.Vector3): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    if (hits.length > 0) {
      let root = hits[0].object;
      while (root.parent && !root.userData.editorId && !root.userData.debugInfo && root.parent !== this.scene) root = root.parent;
      const id = root.userData.editorId, type = root.userData.editorType;
      if (id) {
        if (type === 'building') { this.worldManifest.removeLandmark(id); this.worldManifest.getZones().forEach(z => { if (z.architecture?.landmarks) { const i = z.architecture.landmarks.findIndex(l => l.id === id); if (i !== -1) z.architecture.landmarks.splice(i, 1); } }); }
        else if (type === 'npc') { const i = this.worldManifest.getNPCs().findIndex(n => n.id === id); if (i !== -1) this.worldManifest.getNPCs().splice(i, 1); }
        else if (type === 'feature') { const fs = this.worldManifest.getTerrainFeatures(); const i = fs.findIndex(f => f.id === id); if (i !== -1) fs.splice(i, 1); }
        else if (type === 'path') { const i = parseInt(id.split('_')[1]); this.worldManifest.getPaths().splice(i, 1); }
        window.dispatchEvent(new CustomEvent('editor:manifest_changed'));
        this.refreshVisualization();
      } else if (root.userData.debugInfo) { root.visible = false; root.traverse(c => c.visible = false); }
    }
  }

  private placeNPC(pos: THREE.Vector3): void {
    const n: NPCDefinition = { id: `npc_${Date.now()}`, identity: { name: `New ${this.selectedType}`, role: this.selectedType }, transform: { position: [pos.x, pos.y, pos.z], rotation: [0, 0, 0], scale: 1 }, stats: { max_hp: 100, level: 1 }, ai: { personality_key: "friendly", wander_radius: 10, style: this.selectedType } };
    this.worldManifest.getNPCs().push(n);
    window.dispatchEvent(new CustomEvent('editor:manifest_changed'));
    this.refreshVisualization();
  }

  private placePathPoint(pos: THREE.Vector3): void {
    if (!this.pathStart) { this.pathStart = pos.clone(); const s = new THREE.Mesh(new THREE.CylinderGeometry(2,2,0.5,32), new THREE.MeshBasicMaterial({ color: 0x5d4037, transparent: true, opacity: 0.8 })); s.position.copy(pos).y += 0.3; this.layerPaths.add(s); }
    else { this.worldManifest.getPaths().push({ start: [this.pathStart.x, this.pathStart.z], end: [pos.x, pos.z], width: 10 }); this.pathStart = null; window.dispatchEvent(new CustomEvent('editor:manifest_changed')); this.refreshVisualization(); }
  }

  public updateSelectedObject(props: any): void {
    if (!this.selectedObject) return;
    const id = this.selectedObject.id, type = this.selectedObject.type;
    if (type === 'building') { const l = this.worldManifest.getLandmark(id); if (l) { if (props.rotation) l.transform.rotation = props.rotation; if (props.scale) l.transform.scale = props.scale; } }
    else if (type === 'npc') { const n = this.worldManifest.getNPCs().find(n => n.id === id); if (n) { if (props.rotation) n.transform.rotation = props.rotation; if (props.scale) n.transform.scale = props.scale; } }
    else if (type === 'path') { const i = parseInt(id.split('_')[1]), p = this.worldManifest.getPaths()[i]; if (p && props.pathWidth !== undefined) p.width = props.pathWidth; }
    window.dispatchEvent(new CustomEvent('editor:manifest_changed'));
    this.refreshVisualization();
  }

  private getManifestData(): any { return { version: "2.1.0", world: { environment: this.worldManifest.getEnvironment(), topology: { features: this.worldManifest.getTerrainFeatures() } }, zones: Object.fromEntries(this.worldManifest.getZones()) }; }

  public saveManifest(): void {
    const zs = this.worldManifest.getZones();
    zs.forEach(z => { 
      if (!z.population) z.population = { npcs: [] };
      if (!z.architecture) z.architecture = { landmarks: [], paths: [], dungeons: {} };
      z.population.npcs = []; 
      z.architecture.paths = []; 
    });
    this.worldManifest.getNPCs().forEach(n => { 
      let target = zs.values().next().value; 
      for (const [_, z] of zs) if (n.transform.position[0] >= z.bounds.min[0] && n.transform.position[0] <= z.bounds.max[0] && n.transform.position[2] >= z.bounds.min[1] && n.transform.position[2] <= z.bounds.max[1]) { target = z; break; } 
      if (target) {
        if (!target.population) target.population = { npcs: [] };
        if (!target.population.npcs) target.population.npcs = [];
        target.population.npcs.push(n); 
      }
    });
    this.worldManifest.getPaths().forEach(p => { 
      let target = zs.values().next().value; 
      for (const [_, z] of zs) if (p.start[0] >= z.bounds.min[0] && p.start[0] <= z.bounds.max[0] && p.start[1] >= z.bounds.min[1] && p.start[1] <= z.bounds.max[1]) { target = z; break; } 
      if (target) {
        if (!target.architecture) target.architecture = { landmarks: [], paths: [], dungeons: {} };
        if (!target.architecture.paths) target.architecture.paths = [];
        target.architecture.paths.push(p); 
      }
    });
    this.ws.send({ type: 'world_manifest_update', data: this.getManifestData() });
  }
}
