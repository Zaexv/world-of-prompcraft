/* eslint-disable @typescript-eslint/no-explicit-any */
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

/** Themed accent colour per mode — drives the cursor, brush and helpers. */
const MODE_COLORS: Record<number, number> = {
  [EditorMode.SCULPT_RAISE]: 0x6bff9c,
  [EditorMode.SCULPT_LOWER]: 0xff6b6b,
  [EditorMode.PLACE_OBJECT]: 0xc5a55a,
  [EditorMode.REMOVE_OBJECT]: 0xff4444,
  [EditorMode.MOVE_OBJECT]: 0x66ddff,
  [EditorMode.PLACE_NPC]: 0xbb88ff,
  [EditorMode.PLACE_PATH]: 0xffaa55,
};

const SELECT_COLOR = 0xffe08a;  // warm gold — selected
const HOVER_COLOR = 0x66ddff;   // cyan — hovered

export class TerrainEditor {
  private mode: EditorMode = EditorMode.OFF;
  private brushRadius = 15;
  private brushIntensity = 5;
  private selectedType: string = 'pavilion';

  // ── Cursor visuals ──────────────────────────────────────────────────────
  private cursor: THREE.Group;
  private brushGroup: THREE.Group;     // scaled by brush radius (sculpt footprint)
  private brushRing: THREE.Mesh;
  private brushDisc: THREE.Mesh;
  private cursorDot: THREE.Mesh;       // small centre marker, always shown
  private cursorAxis: THREE.Line;      // vertical pin so the 3D point reads clearly
  private previewMesh: THREE.Object3D | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private lastIntersection: THREE.Intersection | null = null;

  private isMouseDown = false;
  private lastSculptTime = 0;
  private readonly SCULPT_INTERVAL = 100; // ms
  private elapsed = 0;

  // Visualization Layers
  private layerFeatures = new THREE.Group();
  private layerPaths = new THREE.Group();
  private layerZones = new THREE.Group();

  // Selection / hover state
  private selectedObject: { id: string, type: string, group: THREE.Object3D } | null = null;
  private selectionBox: THREE.BoxHelper | null = null;
  private hoverObject: THREE.Object3D | null = null;
  private hoverBox: THREE.BoxHelper | null = null;
  private dragStart: THREE.Vector3 | null = null;
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
    this.cursor.renderOrder = 999;
    this.scene.add(this.cursor);

    // Brush footprint (filled disc + bright ring) — sized at radius 15, scaled later.
    this.brushGroup = new THREE.Group();
    this.cursor.add(this.brushGroup);

    this.brushDisc = new THREE.Mesh(
      new THREE.CircleGeometry(this.brushRadius, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.brushGroup.add(this.brushDisc);

    this.brushRing = new THREE.Mesh(
      new THREE.RingGeometry(this.brushRadius - 0.6, this.brushRadius, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.brushGroup.add(this.brushRing);

    // Always-on centre marker + vertical pin so the cursor point is unambiguous.
    this.cursorDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.cursor.add(this.cursorDot);

    this.cursorAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 7, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.cursor.add(this.cursorAxis);

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
      if (e.button !== 0) return;
      this.isMouseDown = true;
      const pos = this.lastIntersection?.point;
      if (!pos) return;

      switch (this.mode) {
        case EditorMode.PLACE_OBJECT: this.placeObject(pos); break;
        case EditorMode.REMOVE_OBJECT: this.removeObjectAt(pos); break;
        case EditorMode.MOVE_OBJECT:
          // Press to pick + begin dragging; release commits (see mouseup).
          this.pickObject();
          this.dragStart = this.selectedObject ? this.selectedObject.group.position.clone() : null;
          break;
        case EditorMode.PLACE_NPC: this.placeNPC(pos); break;
        case EditorMode.PLACE_PATH: this.placePathPoint(pos); break;
      }
    });

    window.addEventListener('mouseup', () => {
      // Commit a move only if the object was actually dragged somewhere new.
      if (this.mode === EditorMode.MOVE_OBJECT && this.selectedObject && this.dragStart) {
        const moved = this.selectedObject.group.position.distanceTo(this.dragStart) > 0.5;
        if (moved) this.dropObject(this.selectedObject.group.position.clone());
      }
      this.dragStart = null;
      this.isMouseDown = false;
    });

    canvas.addEventListener('contextmenu', (e) => {
      if (this.mode === EditorMode.OFF) return;
      e.preventDefault();
      // Right-click cancels the current selection / path-in-progress.
      if (this.mode === EditorMode.MOVE_OBJECT) this.deselectObject();
      if (this.mode === EditorMode.PLACE_PATH) this.cancelPath();
    });
  }

  public setMode(mode: EditorMode): void {
    this.mode = mode;
    this.cursor.visible = mode !== EditorMode.OFF;
    if (this.selectedObject && mode !== EditorMode.MOVE_OBJECT) this.deselectObject();
    if (mode !== EditorMode.MOVE_OBJECT && mode !== EditorMode.REMOVE_OBJECT) this.setHover(null);
    if (mode !== EditorMode.PLACE_PATH) this.cancelPath();
    this.updatePreview();

    const color = MODE_COLORS[mode] ?? 0xffff00;
    for (const m of [this.brushRing, this.brushDisc, this.cursorDot]) {
      ((m.material as THREE.MeshBasicMaterial).color).set(color);
    }
    (this.cursorAxis.material as THREE.LineBasicMaterial).color.set(color);

    // The radius footprint only reads as a "brush" while sculpting.
    this.brushGroup.visible = mode === EditorMode.SCULPT_RAISE || mode === EditorMode.SCULPT_LOWER;
  }

  public setLayerVisibility(layer: string, visible: boolean): void {
    if (layer === 'features') this.layerFeatures.visible = visible;
    if (layer === 'paths') this.layerPaths.visible = visible;
    if (layer === 'zones') this.layerZones.visible = visible;
    if (layer === 'ui') {
      this.cursor.visible = visible && this.mode !== EditorMode.OFF;
      if (this.selectionBox) this.selectionBox.visible = visible && !!this.selectedObject;
      if (this.hoverBox && !visible) this.hoverBox.visible = false;
    }
    // Buildings and NPCs are real meshes spawned by WorldGenerator/EntityManager,
    // not gizmo groups — toggle them directly on the scene / entity manager.
    if (layer === 'buildings') {
      this.scene.traverse(o => { if (o.userData.editorType === 'building') o.visible = visible; });
    }
    if (layer === 'npcs') {
      const em = (this as any).entityManager;
      em?.npcs.forEach((npc: any) => { if (npc.mesh) npc.mesh.visible = visible; });
    }
  }

  public tick(delta: number): void {
    this.elapsed += delta;
    this.updateCursor();

    // Gentle pulse so the cursor and brush feel alive.
    const pulse = 0.6 + Math.sin(this.elapsed * 4) * 0.25;
    (this.brushRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.5;
    this.cursorDot.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.18);

    // Keep helper boxes glued to their (possibly moving) targets.
    if (this.selectionBox && this.selectedObject) this.selectionBox.update();
    if (this.hoverBox && this.hoverObject) this.hoverBox.update();

    const em = (this as any).entityManager;
    if (em) {
      em.npcs.forEach((npc: any) => {
        if (!npc.isBeingMoved) {
          npc.snapToGround((x: number, z: number) => this.terrain.getHeightAt(x, z));
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
      const start = new THREE.Vector3(path.start[0], this.terrain.getHeightAt(path.start[0], path.start[1]) + 0.25, path.start[1]);
      const end = new THREE.Vector3(path.end[0], this.terrain.getHeightAt(path.end[0], path.end[1]) + 0.25, path.end[1]);
      const dir = end.clone().sub(start);
      const geo = new THREE.PlaneGeometry(path.width, dir.length());
      geo.rotateX(-Math.PI / 2);
      const group = new THREE.Group();
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6d4c33, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xd2a679, transparent: true, opacity: 0.8 }));
      group.add(fill, edge);
      group.position.copy(start).add(dir.multiplyScalar(0.5));
      group.lookAt(end); group.rotateY(Math.PI / 2);
      group.userData = { editorId: `path_${i}`, editorType: 'path' };
      this.layerPaths.add(group);
    });

    for (const [, z] of this.worldManifest.getZones()) {
      this.layerZones.add(this.createZoneGizmo(z.bounds.min, z.bounds.max));
    }
  }

  private clearLayer(l: THREE.Group): void {
    while (l.children.length > 0) {
      const c = l.children[0]; l.remove(c);
      c.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        }
      });
    }
  }

  private createFeatureGizmo(f: VerticalPlace): THREE.Object3D {
    const g = new THREE.Group();
    const baseY = this.terrain.getHeightAt(f.transform.x, f.transform.z);
    g.position.set(f.transform.x, baseY + 0.4, f.transform.z);
    const color = 0xffb74d;
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });

    if (f.shape === 'rect') {
      const w = f.width ?? (f.radii.inner * 2), d = f.depth ?? (f.radii.inner * 2);
      const planeGeo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
      g.add(new THREE.Mesh(planeGeo, fillMat));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo), lineMat));
      if (f.transform.rotation) g.rotation.y = f.transform.rotation;
    } else {
      const r = f.radii.inner;
      g.add(new THREE.Mesh(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2), fillMat));
      g.add(new THREE.Mesh(new THREE.RingGeometry(r - 0.4, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })));
    }

    // Vertical pin + cap so features read as anchored markers in 3D.
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, 0)]),
      lineMat,
    ));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), new THREE.MeshBasicMaterial({ color }));
    cap.position.y = 3;
    g.add(cap);
    return g;
  }

  private createZoneGizmo(min: [number, number], max: [number, number]): THREE.Object3D {
    const color = 0x33ffaa;
    const group = new THREE.Group();
    const w = max[0] - min[0], d = max[1] - min[1];
    const cx = min[0] + w / 2, cz = min[1] + d / 2;
    const y = 0.4;

    // Bright boundary outline (reads far better than a subdivided wireframe plane).
    const corners = [
      new THREE.Vector3(min[0], y, min[1]),
      new THREE.Vector3(max[0], y, min[1]),
      new THREE.Vector3(max[0], y, max[1]),
      new THREE.Vector3(min[0], y, max[1]),
    ];
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(corners),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    group.add(outline);

    // Very faint fill for area sense.
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false }),
    );
    fill.position.set(cx, y, cz);
    group.add(fill);
    return group;
  }

  public setBrushRadius(r: number): void { this.brushRadius = r; this.brushGroup.scale.setScalar(r / 15); }
  public setBrushIntensity(i: number): void { this.brushIntensity = i; }
  public setSelectedAsset(t: string, _: string): void { this.selectedType = t; this.updatePreview(); }

  private updatePreview(): void {
    if (this.previewMesh) { this.cursor.remove(this.previewMesh); this.previewMesh = null; }
    if (this.mode === EditorMode.PLACE_OBJECT) {
      this.previewMesh = buildObject(this.selectedType, new THREE.Vector3(0, 0, 0), 1);
    } else if (this.mode === EditorMode.PLACE_NPC) {
      this.previewMesh = NPC.create({ id: 'preview', name: 'Preview', position: new THREE.Vector3(0, 0, 0), style: this.selectedType as any }, this.assetLoader).mesh;
    }
    if (this.previewMesh) {
      this.previewMesh.traverse(o => { if (o instanceof THREE.Mesh) { o.material = (o.material as THREE.Material).clone(); (o.material as any).transparent = true; (o.material as any).opacity = 0.55; (o.material as any).depthWrite = false; } });
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
      this.cursor.position.copy(p); this.cursor.position.y += 0.15; this.cursor.visible = true;

      if (this.mode === EditorMode.MOVE_OBJECT && this.selectedObject && this.isMouseDown) {
        this.selectedObject.group.position.copy(p);
        if (this.selectedObject.type === 'building') {
          this.selectedObject.group.position.y = this.terrain.getHeightAt(p.x, p.z);
        } else if (this.selectedObject.type === 'npc') {
          const npc = (this as any).entityManager?.npcs.get(this.selectedObject.id);
          if (npc) { npc.position.copy(p); npc.homePosition.copy(p); npc.isBeingMoved = true; }
        }
      }
      if (this.isMouseDown && (this.mode === EditorMode.SCULPT_RAISE || this.mode === EditorMode.SCULPT_LOWER)) this.handleAction();
    } else {
      this.lastIntersection = null; this.cursor.visible = false;
    }

    // Hover feedback when picking/removing (but not mid-drag).
    if ((this.mode === EditorMode.MOVE_OBJECT || this.mode === EditorMode.REMOVE_OBJECT) && !this.isMouseDown) {
      this.updateHover();
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

  /** Find the editable object (or procedural debug object) currently under the cursor. */
  private findEditorObjectUnderCursor(allowDebug: boolean): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      const obj = hit.object;
      if (obj.userData.isWater) continue;
      let current: THREE.Object3D | null = obj;
      while (current && !current.userData.editorId && current.parent && current.parent !== this.scene) {
        current = current.parent;
      }
      if (current && current.userData.editorId) return current;
      if (allowDebug) {
        let d: THREE.Object3D | null = obj;
        while (d && !d.userData.debugInfo && d.parent && d.parent !== this.scene) d = d.parent;
        if (d && d.userData.debugInfo) return d;
      }
    }
    return null;
  }

  private updateHover(): void {
    const found = this.findEditorObjectUnderCursor(this.mode === EditorMode.REMOVE_OBJECT);
    this.setHover(found && found === this.selectedObject?.group ? null : found);
  }

  private setHover(obj: THREE.Object3D | null): void {
    if (obj === this.hoverObject) return;
    this.hoverObject = obj;
    if (!obj) { if (this.hoverBox) this.hoverBox.visible = false; return; }
    if (!this.hoverBox) {
      this.hoverBox = new THREE.BoxHelper(obj, HOVER_COLOR);
      const m = this.hoverBox.material as THREE.LineBasicMaterial;
      m.depthTest = false; m.transparent = true; m.opacity = 0.9;
      this.hoverBox.renderOrder = 998;
      this.scene.add(this.hoverBox);
    } else {
      this.hoverBox.setFromObject(obj);
    }
    this.hoverBox.visible = true;
  }

  private pickObject(): void {
    const found = this.findEditorObjectUnderCursor(false);
    if (found && found === this.selectedObject?.group) return; // re-clicking the same keeps it
    this.deselectObject();
    if (found) this.selectObject(found);
  }

  private selectObject(group: THREE.Object3D): void {
    this.selectedObject = { id: group.userData.editorId, type: group.userData.editorType, group };
    this.applyHighlight(group);
    this.setHover(null);
    if (!this.selectionBox) {
      this.selectionBox = new THREE.BoxHelper(group, SELECT_COLOR);
      const m = this.selectionBox.material as THREE.LineBasicMaterial;
      m.depthTest = false; m.transparent = true; m.opacity = 1;
      this.selectionBox.renderOrder = 1000;
      this.scene.add(this.selectionBox);
    } else {
      this.selectionBox.setFromObject(group);
    }
    this.selectionBox.visible = true;
    window.dispatchEvent(new CustomEvent('editor:select', { detail: this.selectedObject }));
  }

  private dropObject(pos: THREE.Vector3): void {
    if (!this.selectedObject) return;
    const id = this.selectedObject.id, type = this.selectedObject.type;
    // Snap to authoritative terrain height so dropped items never float/drown.
    const groundY = this.terrain.getHeightAt(pos.x, pos.z);
    const p: [number, number, number] = [pos.x, groundY, pos.z];
    if (type === 'building') {
      const l = this.worldManifest.getAllLandmarks().find(l => l.id === id); if (l) l.transform.position = p;
    } else if (type === 'npc') {
      const n = this.worldManifest.getNPCs().find(n => n.id === id); if (n) n.transform.position = p;
      const npc = (this as any).entityManager?.npcs.get(id); if (npc) npc.isBeingMoved = false;
    } else if (type === 'feature') {
      const f = this.worldManifest.getTerrainFeatures().find(f => f.id === id); if (f) { f.transform.x = pos.x; f.transform.z = pos.z; }
    }
    this.deselectObject();
    this.notifyManifestChanged(pos.x, pos.z);
    this.refreshVisualization();
  }

  private deselectObject(): void {
    if (this.selectedObject) {
      this.selectedObject.group.traverse(o => { if (o instanceof THREE.Mesh && o.userData.origMat) o.material = o.userData.origMat; });
      this.selectedObject = null;
      if (this.selectionBox) this.selectionBox.visible = false;
      window.dispatchEvent(new CustomEvent('editor:select', { detail: null }));
    }
  }

  private applyHighlight(o: THREE.Object3D): void {
    o.traverse(c => {
      if (c instanceof THREE.Mesh) {
        if (!c.userData.origMat) c.userData.origMat = c.material;
        const h = (c.material as THREE.Material).clone();
        if ('emissive' in h) {
          (h as any).emissive = new THREE.Color(SELECT_COLOR);
          (h as any).emissiveIntensity = 0.6;
        }
        c.material = h;
      }
    });
  }

  private sculptTerrain(pos: THREE.Vector3, dir: number): void {
    // True additive sculpting: each tick deposits a smooth radial height delta
    // (+ for RAISE, − for LOWER). The manifest merges repeated deposits at the
    // same spot, so holding the brush carves a deeper hill/valley. Terrain mesh,
    // collision and player physics all read this back via Terrain.getHeightAt.
    const delta = dir * (this.brushIntensity / 10);
    this.worldManifest.addSculptStroke(pos.x, pos.z, this.brushRadius, delta);
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
    this.notifyManifestChanged(pos.x, pos.z);
    this.refreshVisualization();
  }

  private removeObjectAt(_pos: THREE.Vector3): void {
    const target = this.findEditorObjectUnderCursor(true);
    if (!target) return;
    const id = target.userData.editorId, type = target.userData.editorType;

    if (id) {
      if (type === 'building') { this.worldManifest.removeLandmark(id); this.worldManifest.getZones().forEach(z => { if (z.architecture?.landmarks) { const i = z.architecture.landmarks.findIndex(l => l.id === id); if (i !== -1) z.architecture.landmarks.splice(i, 1); } }); }
      else if (type === 'npc') { const i = this.worldManifest.getNPCs().findIndex(n => n.id === id); if (i !== -1) this.worldManifest.getNPCs().splice(i, 1); }
      else if (type === 'feature') { const fs = this.worldManifest.getTerrainFeatures(); const i = fs.findIndex(f => f.id === id); if (i !== -1) fs.splice(i, 1); }
      else if (type === 'path') { const i = parseInt(id.split('_')[1]); this.worldManifest.getPaths().splice(i, 1); }
      this.setHover(null);
      this.notifyManifestChanged(target.position.x, target.position.z);
      this.refreshVisualization();
    } else if (target.userData.debugInfo) {
      target.visible = false;
      target.traverse(c => c.visible = false);
      this.setHover(null);
    }
  }

  private placeNPC(pos: THREE.Vector3): void {
    const n: NPCDefinition = { id: `npc_${Date.now()}`, identity: { name: `New ${this.selectedType}`, role: this.selectedType }, transform: { position: [pos.x, pos.y, pos.z], rotation: [0, 0, 0], scale: 1 }, stats: { max_hp: 100, level: 1 }, ai: { personality_key: "friendly", wander_radius: 10, style: this.selectedType } };
    this.worldManifest.getNPCs().push(n);
    this.notifyManifestChanged(pos.x, pos.z);
    this.refreshVisualization();
  }

  private placePathPoint(pos: THREE.Vector3): void {
    if (!this.pathStart) {
      this.pathStart = pos.clone();
      const s = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.85, depthWrite: false }));
      s.position.copy(pos).y += 0.3;
      s.userData.isPathMarker = true;
      this.layerPaths.add(s);
    } else {
      this.worldManifest.getPaths().push({ start: [this.pathStart.x, this.pathStart.z], end: [pos.x, pos.z], width: 10 });
      this.pathStart = null;
      this.notifyManifestChanged(pos.x, pos.z);
      this.refreshVisualization();
    }
  }

  /** Abandon an in-progress path (right-click / mode change). */
  private cancelPath(): void {
    if (!this.pathStart) return;
    this.pathStart = null;
    this.refreshVisualization();
  }

  public updateSelectedObject(props: any): void {
    if (!this.selectedObject) return;
    const id = this.selectedObject.id, type = this.selectedObject.type;
    if (type === 'building') { const l = this.worldManifest.getLandmark(id); if (l) { if (props.rotation) l.transform.rotation = props.rotation; if (props.scale) l.transform.scale = props.scale; } }
    else if (type === 'npc') { const n = this.worldManifest.getNPCs().find(n => n.id === id); if (n) { if (props.rotation) n.transform.rotation = props.rotation; if (props.scale) n.transform.scale = props.scale; } }
    else if (type === 'path') { const i = parseInt(id.split('_')[1]), p = this.worldManifest.getPaths()[i]; if (p && props.pathWidth !== undefined) p.width = props.pathWidth; }
    const g = this.selectedObject.group.position;
    this.notifyManifestChanged(g.x, g.z);
    this.refreshVisualization();
  }

  private getManifestData(): any { return this.worldManifest.toData(); }

  /** Notify the host app that the manifest changed, including where, so it can refresh terrain/spawns at the edit. */
  private notifyManifestChanged(x?: number, z?: number): void {
    window.dispatchEvent(new CustomEvent('editor:manifest_changed', { detail: { x, z } }));
  }

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
      for (const [, z] of zs) if (n.transform.position[0] >= z.bounds.min[0] && n.transform.position[0] <= z.bounds.max[0] && n.transform.position[2] >= z.bounds.min[1] && n.transform.position[2] <= z.bounds.max[1]) { target = z; break; }
      if (target) {
        if (!target.population) target.population = { npcs: [] };
        if (!target.population.npcs) target.population.npcs = [];
        target.population.npcs.push(n);
      }
    });
    this.worldManifest.getPaths().forEach(p => {
      let target = zs.values().next().value;
      for (const [, z] of zs) if (p.start[0] >= z.bounds.min[0] && p.start[0] <= z.bounds.max[0] && p.start[1] >= z.bounds.min[1] && p.start[1] <= z.bounds.max[1]) { target = z; break; }
      if (target) {
        if (!target.architecture) target.architecture = { landmarks: [], paths: [], dungeons: {} };
        if (!target.architecture.paths) target.architecture.paths = [];
        target.architecture.paths.push(p);
      }
    });
    this.ws.send({ type: 'world_manifest_update', data: this.getManifestData() });
  }
}
