/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three';
import { Terrain, FOOTPRINT_SPECS } from '../scene/Terrain';
import { WorldManifest, LandmarkDefinition, VerticalPlace, NPCDefinition, SculptStroke } from '../state/WorldManifest';
import { WebSocketClient } from '../network/WebSocketClient';
import { buildObject } from '../systems/worldbuilder/objects';
import { NPC } from '../entities/NPC';
import { AssetLoader } from '../utils/asset/AssetLoader';

export enum EditorMode {
  OFF,
  SCULPT_RAISE,
  SCULPT_LOWER,
  SCULPT_FLATTEN,
  PLACE_OBJECT,
  REMOVE_OBJECT,
  MOVE_OBJECT,
  PLACE_NPC,
  PLACE_PATH,
  PAINT_GROUND,
  ERASE_TERRAIN
}

/** Themed accent colour per mode — drives the cursor, brush and helpers. */
const MODE_COLORS: Record<number, number> = {
  [EditorMode.SCULPT_RAISE]: 0x6bff9c,
  [EditorMode.SCULPT_LOWER]: 0xff6b6b,
  [EditorMode.SCULPT_FLATTEN]: 0x5a9cc5,
  [EditorMode.PLACE_OBJECT]: 0xc5a55a,
  [EditorMode.REMOVE_OBJECT]: 0xff4444,
  [EditorMode.MOVE_OBJECT]: 0x66ddff,
  [EditorMode.PLACE_NPC]: 0xbb88ff,
  [EditorMode.PLACE_PATH]: 0xffaa55,
  [EditorMode.PAINT_GROUND]: 0x88dd66,
  [EditorMode.ERASE_TERRAIN]: 0xff44aa,  // Magenta — strips manual sculpt back to procedural
};

const SELECT_COLOR = 0xffe08a;  // warm gold — selected
const HOVER_COLOR = 0x66ddff;   // cyan — hovered

export class TerrainEditor {
  private mode: EditorMode = EditorMode.OFF;
  private brushRadius = 15;
  private brushIntensity = 5;
  private selectedType: string = 'pavilion';
  private selectedGroundType: string = 'grass';

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
  private layerSculpt = new THREE.Group();  // overlay of manual terrain edits (sculpt strokes)

  // Selection / hover state
  private selectedObject: { id: string, type: string, group: THREE.Object3D } | null = null;
  private selectionBox: THREE.BoxHelper | null = null;
  private hoverObject: THREE.Object3D | null = null;
  private hoverBox: THREE.BoxHelper | null = null;
  private dragStart: THREE.Vector3 | null = null;
  private pathStart: THREE.Vector3 | null = null;

  // Rotation state (radians, around Y axis)
  private currentRotation = 0;

  // History for Undo/Redo
  private history: any[] = [];
  private historyIndex = -1;
  private didSculpt = false;
  
  // Track visual-only spawns from editor so they can be cleaned up on full rebuilds (like Undo)
  private manualSpawns: THREE.Object3D[] = [];
  private manualNPCs: string[] = [];

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
    this.scene.add(this.layerSculpt);

    this.setupListeners();
    this.refreshVisualization();
  }

  private setupListeners(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.isMouseDown && this.mode !== EditorMode.OFF) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }, { capture: true });

    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === EditorMode.OFF) return;
      if (e.button !== 0) return;

      // If we are in an active editor mode, prevent OrbitControls from moving the map.
      // For MOVE_OBJECT, only intercept if we actually clicked an object.
      if (this.mode === EditorMode.MOVE_OBJECT) {
        const hit = this.findEditorObjectUnderCursor(false);
        if (hit) {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      } else {
        // Sculpting, Placing, Removing, etc.
        e.stopPropagation();
        e.stopImmediatePropagation();
      }

      this.isMouseDown = true;
      const pos = this.lastIntersection?.point;
      if (!pos) return;

      switch (this.mode) {
        case EditorMode.PLACE_OBJECT: this.placeObject(pos); break;
        case EditorMode.REMOVE_OBJECT: this.removeObjectAt(pos); break;
        case EditorMode.MOVE_OBJECT:
          // Press to pick + begin dragging; release commits (see pointerup).
          this.pickObject();
          this.dragStart = this.selectedObject ? this.selectedObject.group.position.clone() : null;
          break;
        case EditorMode.PLACE_NPC: this.placeNPC(pos); break;
        case EditorMode.PLACE_PATH: this.placePathPoint(pos); break;
      }
    }, { capture: true });

    window.addEventListener('pointerup', () => {
      // Commit a move only if the object was actually dragged somewhere new.
      if (this.mode === EditorMode.MOVE_OBJECT && this.selectedObject && this.dragStart) {
        const moved = this.selectedObject.group.position.distanceTo(this.dragStart) > 0.5;
        if (moved) {
          this.dropObject(this.selectedObject.group.position.clone());
        }
      }
      if (this.didSculpt) {
        this.saveState();
        this.didSculpt = false;
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

    // Rotation via scroll wheel when holding 'R'
    canvas.addEventListener('wheel', (e) => {
      if (this.mode === EditorMode.OFF) return;
      const keys = (window as any).keys || {};
      if (keys['KeyR']) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Default to snapping to 45 degrees (Math.PI / 4). Hold Shift for fine rotation.
        const snapAngle = e.shiftKey ? 0.05 : (Math.PI / 4);
        const delta = e.deltaY > 0 ? -snapAngle : snapAngle;
        
        this.currentRotation += delta;

        // Ensure we snap to exact multiples if not holding shift to avoid floating point drift
        if (!e.shiftKey) {
            this.currentRotation = Math.round(this.currentRotation / snapAngle) * snapAngle;
        }

        if (this.previewMesh) {
          this.previewMesh.rotation.y = this.currentRotation;
        }
        if (this.mode === EditorMode.MOVE_OBJECT && this.selectedObject) {
          this.selectedObject.group.rotation.y = this.currentRotation;
          // Immediately save the rotation to the manifest without needing to drop/move the object
          this.updateSelectedObjectQuietly({ rotation: [0, this.currentRotation, 0] });
        }
      }
    }, { passive: false, capture: true });
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
    this.brushGroup.visible = mode === EditorMode.SCULPT_RAISE || mode === EditorMode.SCULPT_LOWER || mode === EditorMode.SCULPT_FLATTEN || mode === EditorMode.PAINT_GROUND || mode === EditorMode.ERASE_TERRAIN;
  }

  public setLayerVisibility(layer: string, visible: boolean): void {
    if (layer === 'features') this.layerFeatures.visible = visible;
    if (layer === 'paths') this.layerPaths.visible = visible;
    if (layer === 'zones') this.layerZones.visible = visible;
    if (layer === 'sculpt') this.layerSculpt.visible = visible;
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
    this.clearLayer(this.layerSculpt);

    for (const s of this.worldManifest.getSculpt()) {
      this.layerSculpt.add(this.createSculptGizmo(s));
    }

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

  /**
   * Flat colour-coded disc marking a manual terrain edit: green = raised,
   * red = lowered, blue = flattened. Lets the user see (and target with the
   * ERASE TERRAIN brush) exactly where the land is no longer purely generative.
   */
  private createSculptGizmo(s: SculptStroke): THREE.Object3D {
    const g = new THREE.Group();
    const y = this.terrain.getHeightAt(s.x, s.z);
    g.position.set(s.x, y + 0.3, s.z);
    const color = s.flatten ? 0x5a9cc5 : (s.delta >= 0 ? 0x6bff9c : 0xff6b6b);
    g.add(new THREE.Mesh(
      new THREE.CircleGeometry(s.radius, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    ));
    g.add(new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.1, s.radius - 0.6), s.radius, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    ));
    return g;
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
      const built = buildObject(this.selectedType, new THREE.Vector3(0, 0, 0), 1);
      // Buildings are wrapped in a THREE.LOD whose detailed level only shows
      // within ~180 units of the camera. The editor camera is usually farther
      // out while placing, so the ghost would collapse to a stripped/empty LOD
      // level and read as "nothing there". Always preview the full-detail level.
      if (built instanceof THREE.LOD && built.levels.length > 0) {
        const full = built.levels[0].object;
        full.position.set(0, 0, 0);
        this.previewMesh = full;
      } else {
        this.previewMesh = built;
      }
    } else if (this.mode === EditorMode.PLACE_NPC) {
      this.previewMesh = NPC.create({ id: 'preview', name: 'Preview', position: new THREE.Vector3(0, 0, 0), style: this.selectedType as any }, this.assetLoader).mesh;
    }
    if (this.previewMesh) {
      this.previewMesh.rotation.y = this.currentRotation;
      // Clone per-mesh materials so the ghost can go translucent without mutating
      // the shared catalog materials. Meshes may carry a material ARRAY (e.g. the
      // multi-material door) — handle both or .clone() throws and the preview is
      // silently dropped.
      const ghost = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        c.transparent = true; c.opacity = 0.55; c.depthWrite = false;
        return c;
      };
      this.previewMesh.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.material = Array.isArray(o.material) ? o.material.map(ghost) : ghost(o.material);
        }
      });
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

      // Apply Snapping logic for placement and dragging (unless holding Shift).
      // Must run BEFORE positioning the cursor so the ghost preview sits where the
      // object will actually land.
      if (this.mode === EditorMode.PLACE_OBJECT || (this.mode === EditorMode.MOVE_OBJECT && this.selectedObject && this.isMouseDown)) {
        const keys = (window as any).keys || {};
        if (!keys['ShiftLeft'] && !keys['ShiftRight']) {
           const typeToSnap = this.mode === EditorMode.PLACE_OBJECT ? this.selectedType : (this.selectedObject?.type === 'building' ? this.worldManifest.getLandmark(this.selectedObject.id)?.type : null);
           if (typeToSnap) {
             this.snapToNearestSimilar(p, typeToSnap, this.selectedObject?.id);
           }
        }
      }

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
      if (this.isMouseDown && (this.mode === EditorMode.SCULPT_RAISE || this.mode === EditorMode.SCULPT_LOWER || this.mode === EditorMode.SCULPT_FLATTEN || this.mode === EditorMode.PAINT_GROUND || this.mode === EditorMode.ERASE_TERRAIN)) this.handleAction();
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
      if (this.mode === EditorMode.PAINT_GROUND) {
        this.paintGround(this.lastIntersection.point);
      } else if (this.mode === EditorMode.ERASE_TERRAIN) {
        this.eraseTerrainAt(this.lastIntersection.point);
      } else if (this.mode === EditorMode.SCULPT_FLATTEN) {
        this.sculptTerrain(this.lastIntersection.point, 0, true);
      } else {
        this.sculptTerrain(this.lastIntersection.point, this.mode === EditorMode.SCULPT_RAISE ? 1 : -1, false);
      }
      this.lastSculptTime = now;
      this.didSculpt = true;
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

  public saveState(): void {
    const data = this.getManifestData();
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(JSON.parse(JSON.stringify(data)));
    this.historyIndex++;
  }

  public undo(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.worldManifest.hydrate(this.history[this.historyIndex]);
      this.deselectObject();
      this.notifyManifestChanged(); 
    }
  }

  public redo(): void {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.worldManifest.hydrate(this.history[this.historyIndex]);
      this.deselectObject();
      this.notifyManifestChanged();
    }
  }

  /**
   * Snap `pos` so the placed/dragged object butts edge-to-edge against the nearest
   * same-type building with NO gap — for tiling walls into a continuous run.
   * Keeps the user's current rotation (does NOT inherit the target's). The contact
   * face is whichever side of the target the cursor is nearest; the new object is
   * pushed out by exactly its own projected half-extent so the faces touch.
   */
  private snapToNearestSimilar(pos: THREE.Vector3, type: string, excludeId?: string): void {
    let nearestDist = 15; // Only snap if cursor within 15 units of the wall's footprint
    let targetObj: THREE.Object3D | undefined = undefined;

    // Find nearest same-type object by distance to its FOOTPRINT (not its origin) so
    // the back/ends of a long wall are just as snappable as its centre.
    this.scene.traverse(o => {
      if (o.userData.editorType === 'building' && o.userData.editorId !== excludeId) {
         const l = this.worldManifest.getLandmark(o.userData.editorId);
         if (l && l.type === type) {
            const box = new THREE.Box3().setFromObject(o);
            const ddx = Math.max(box.min.x - pos.x, 0, pos.x - box.max.x);
            const ddz = Math.max(box.min.z - pos.z, 0, pos.z - box.max.z);
            const dist = Math.hypot(ddx, ddz);
            if (dist < nearestDist) {
               nearestDist = dist;
               targetObj = o;
            }
         }
      }
    });

    if (!targetObj) return;
    const target = targetObj as THREE.Object3D;

    // Measure the target's true (unrotated) footprint half-extents.
    const origRot = target.rotation.y;
    target.rotation.y = 0;
    target.updateMatrixWorld(true);
    const localBox = new THREE.Box3().setFromObject(target);
    target.rotation.y = origRot;
    target.updateMatrixWorld(true);

    const size = new THREE.Vector3(); localBox.getSize(size);
    const boxCenter = new THREE.Vector3(); localBox.getCenter(boxCenter);
    const thx = size.x / 2, thz = size.z / 2;
    const offX = boxCenter.x - target.position.x;
    const offZ = boxCenter.z - target.position.z;

    // Target world axes + footprint centre.
    const cosT = Math.cos(origRot), sinT = Math.sin(origRot);
    const fcx = target.position.x + offX * cosT + offZ * sinT;
    const fcz = target.position.z - offX * sinT + offZ * cosT;

    // Cursor relative to footprint centre, projected onto the target's local axes.
    const rx = pos.x - fcx, rz = pos.z - fcz;
    const lx = rx * cosT - rz * sinT;   // along target +X
    const lz = rx * sinT + rz * cosT;   // along target +Z

    // Two unit axes of the target in world space.
    const axX = { x: cosT, z: -sinT };  // target local +X
    const axZ = { x: sinT, z: cosT };   // target local +Z

    // `n` = contact-face normal (the target side the cursor is most beyond),
    // `t` = the tangent (along the contact face). `sn`/`st` are which side.
    // Compare RAW distance beyond each face (not normalised) so a thin wall's small
    // end faces are as easy to hit as its long back/front faces.
    let n: { x: number; z: number }, t: { x: number; z: number };
    let targetNorm: number, targetTan: number, sn: number, st: number;
    if (Math.abs(lx) - thx >= Math.abs(lz) - thz) {
      sn = Math.sign(lx) || 1; st = Math.sign(lz) || 1;
      n = axX; t = axZ; targetNorm = thx; targetTan = thz;
    } else {
      sn = Math.sign(lz) || 1; st = Math.sign(lx) || 1;
      n = axZ; t = axX; targetNorm = thz; targetTan = thx;
    }

    // New object keeps the USER's rotation. Same type ⇒ same footprint half-extents.
    // Project its half-size onto the contact normal and tangent.
    const cosN = Math.cos(this.currentRotation), sinN = Math.sin(this.currentRotation);
    const proj = (ax: number, az: number): number =>
      thx * Math.abs(ax * cosN - az * sinN) + thz * Math.abs(ax * sinN + az * cosN);
    const newNorm = proj(n.x, n.z);
    const newTan = proj(t.x, t.z);

    // Normal: push out so the faces touch with no gap.
    const normDist = sn * (targetNorm + newNorm);
    // Tangent: align the outer edges flush on the cursor's side → L-corner.
    // (For a collinear same-rotation run newTan === targetTan ⇒ offset 0 ⇒ seamless tiling.)
    const tanDist = st * (targetTan - newTan);

    pos.x = fcx + n.x * normDist + t.x * tanDist;
    pos.z = fcz + n.z * normDist + t.z * tanDist;
  }

  private pickObject(): void {
    const found = this.findEditorObjectUnderCursor(false);
    if (found && found === this.selectedObject?.group) return; // re-clicking the same keeps it
    this.deselectObject();
    if (found) this.selectObject(found);
  }

  private selectObject(group: THREE.Object3D): void {
    this.selectedObject = { id: group.userData.editorId, type: group.userData.editorType, group };
    // Seed rotation from the picked object so the first wheel tick doesn't jump it to a stale value.
    this.currentRotation = group.rotation.y;
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
      const l = this.worldManifest.getAllLandmarks().find(l => l.id === id); 
      if (l) {
        l.transform.position = p;
        l.transform.rotation = [0, this.currentRotation, 0];
      }
    } else if (type === 'npc') {
      const n = this.worldManifest.getNPCs().find(n => n.id === id); 
      if (n) {
        n.transform.position = p;
        n.transform.rotation = [0, this.currentRotation, 0];
      }
      const npc = (this as any).entityManager?.npcs.get(id); if (npc) npc.isBeingMoved = false;
    } else if (type === 'feature') {
      const f = this.worldManifest.getTerrainFeatures().find(f => f.id === id); if (f) { f.transform.x = pos.x; f.transform.z = pos.z; f.transform.rotation = this.currentRotation; }
    }

    // Apply position visually
    this.selectedObject.group.position.set(p[0], p[1], p[2]);

    // We intentionally DO NOT call this.deselectObject() here so the object remains selected after a move.
    // We also DO NOT call notifyManifestChanged here, because that triggers a full world tear-down and respawn,
    // which causes massive lag, flashing, and orphans our selectedObject reference.
    this.refreshVisualization();
    this.saveState();
  }

  public deselectObject(): void {
    if (this.selectedObject) {
      this.selectedObject.group.traverse(o => { if (o instanceof THREE.Mesh && o.userData.origMat) o.material = o.userData.origMat; });
      this.selectedObject = null;
      if (this.selectionBox) this.selectionBox.visible = false;
      window.dispatchEvent(new CustomEvent('editor:select', { detail: null }));
    }
  }

  private applyHighlight(o: THREE.Object3D): void {
    // Highlight a clone so the shared catalog material is never mutated. Meshes
    // may carry a material ARRAY (e.g. the multi-material door) — handle both or
    // .clone() throws and selecting that building breaks.
    const highlight = (m: THREE.Material): THREE.Material => {
      const h = m.clone();
      if ('emissive' in h) {
        (h as any).emissive = new THREE.Color(SELECT_COLOR);
        (h as any).emissiveIntensity = 0.6;
      }
      return h;
    };
    o.traverse(c => {
      if (c instanceof THREE.Mesh) {
        if (!c.userData.origMat) c.userData.origMat = c.material;
        c.material = Array.isArray(c.material) ? c.material.map(highlight) : highlight(c.material);
      }
    });
  }

  private sculptTerrain(pos: THREE.Vector3, dir: number, flatten = false): void {
    if (flatten) {
      // Flatten towards the height exactly at the brush center
      const targetHeight = this.terrain.getHeightAt(pos.x, pos.z);
      this.worldManifest.addSculptStroke(pos.x, pos.z, this.brushRadius, targetHeight, true);
    } else {
      const delta = dir * (this.brushIntensity / 10);
      this.worldManifest.addSculptStroke(pos.x, pos.z, this.brushRadius, delta);
    }
    this.terrain.setManifest(this.getManifestData());
    this.terrain.refreshAt(pos.x, pos.z, this.brushRadius + 20);
    this.refreshVisualization();
  }

  /**
   * Strip every manual sculpt stroke whose centre falls inside the brush, so
   * the terrain reverts to its pure procedural (generative) base in that area.
   * Drag like a brush; the sculpt overlay updates live to show what remains.
   */
  private eraseTerrainAt(pos: THREE.Vector3): void {
    const strokes = this.worldManifest.getSculpt();
    let removed = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (Math.hypot(strokes[i].x - pos.x, strokes[i].z - pos.z) <= this.brushRadius) {
        strokes.splice(i, 1);
        removed = true;
      }
    }
    if (!removed) return;
    this.terrain.setManifest(this.getManifestData());
    this.terrain.refreshAt(pos.x, pos.z, this.brushRadius + 20);
    this.refreshVisualization();
  }

  public setSelectedGroundType(t: string): void { this.selectedGroundType = t; }

  /** Paint the chosen surface type (grass/sand/mud/…) into the brush footprint. */
  private paintGround(pos: THREE.Vector3): void {
    this.worldManifest.addPaintStroke(pos.x, pos.z, this.brushRadius, this.selectedGroundType);
    this.terrain.setManifest(this.getManifestData());
    this.terrain.refreshAt(pos.x, pos.z, this.brushRadius + 20);
  }

  private placeObject(pos: THREE.Vector3): void {
    const zones = this.worldManifest.getZones();
    let zid = 'teldrassil_central';
    for (const [id, z] of zones) if (pos.x >= z.bounds.min[0] && pos.x <= z.bounds.max[0] && pos.z >= z.bounds.min[1] && pos.z <= z.bounds.max[1]) { zid = id; break; }
    const z = zones.get(zid); if (!z) return;

    if (!z.architecture) z.architecture = { landmarks: [], paths: [], dungeons: {} };
    if (!z.architecture.landmarks) z.architecture.landmarks = [];

    const l: LandmarkDefinition = { 
      id: `${this.selectedType}_${Date.now()}`, 
      type: this.selectedType, 
      transform: { 
        position: [pos.x, 0, pos.z], 
        scale: 1, 
        rotation: [0, this.currentRotation, 0] 
      }, 
      visual: { label: this.selectedType } 
    };
    z.architecture.landmarks.push(l); this.worldManifest.addLandmark(l);
    
    // Visually spawn it immediately to avoid full world refresh lag
    const wb = (this as any).worldBuilder;
    if (wb) {
      const spawned = wb.spawnObject({
        objectId: l.id,
        objectType: l.type,
        position: l.transform.position,
        rotation: l.transform.rotation,
        scale: l.transform.scale,
        label: l.visual.label,
        persist: false // Handled by manifest
      }, true);
      if (spawned) this.manualSpawns.push(spawned);
    }
    
    this.refreshVisualization();
    this.saveState();
  }

  private removeObjectAt(_pos: THREE.Vector3): void {
    const target = this.findEditorObjectUnderCursor(true);
    if (!target) return;
    this.executeRemoval(target);
  }

  public deleteSelectedObject(): void {
    if (!this.selectedObject) return;
    this.executeRemoval(this.selectedObject.group);
  }

  private executeRemoval(target: THREE.Object3D): void {
    const id = target.userData.editorId, type = target.userData.editorType;

    if (id) {
      if (type === 'building') { this.worldManifest.removeLandmark(id); this.worldManifest.getZones().forEach(z => { if (z.architecture?.landmarks) { const i = z.architecture.landmarks.findIndex(l => l.id === id); if (i !== -1) z.architecture.landmarks.splice(i, 1); } }); }
      else if (type === 'npc') { const i = this.worldManifest.getNPCs().findIndex(n => n.id === id); if (i !== -1) this.worldManifest.getNPCs().splice(i, 1); }
      else if (type === 'feature') { const fs = this.worldManifest.getTerrainFeatures(); const i = fs.findIndex(f => f.id === id); if (i !== -1) fs.splice(i, 1); }
      else if (type === 'path') { const i = parseInt(id.split('_')[1]); this.worldManifest.getPaths().splice(i, 1); }
      this.setHover(null);
      this.deselectObject();
      
      // Visually hide the object immediately to avoid full world refresh lag
      target.visible = false;
      target.traverse(c => c.visible = false);
      if (type === 'npc') {
        const em = (this as any).entityManager;
        if (em) em.removeNPC(id);
      }

      this.refreshVisualization();
      this.saveState();
    } else if (target.userData.debugInfo) {
      target.visible = false;
      target.traverse(c => c.visible = false);
      this.setHover(null);
      this.deselectObject();
    }
  }


  private placeNPC(pos: THREE.Vector3): void {
    const n: NPCDefinition = { 
      id: `npc_${Date.now()}`, 
      identity: { name: `New ${this.selectedType}`, role: this.selectedType }, 
      transform: { 
        position: [pos.x, pos.y, pos.z], 
        rotation: [0, this.currentRotation, 0], 
        scale: 1 
      }, 
      stats: { max_hp: 100, level: 1 }, 
      ai: { personality_key: "friendly", wander_radius: 10, style: this.selectedType } 
    };
    this.worldManifest.getNPCs().push(n);
    
    // Visually spawn it immediately to avoid full world refresh lag
    const em = (this as any).entityManager;
    if (em) {
      em.addNPC({
        id: n.id,
        name: n.identity.name,
        position: new THREE.Vector3(...n.transform.position),
        personalityKey: n.ai.personality_key,
        wanderRadius: n.ai.wander_radius,
        scale: n.transform.scale,
        style: n.ai.style as any
      });
      this.manualNPCs.push(n.id);
    }

    this.refreshVisualization();
    this.saveState();
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
      this.saveState();
    }
  }

  /** Abandon an in-progress path (right-click / mode change). */
  private cancelPath(): void {
    if (!this.pathStart) return;
    this.pathStart = null;
    this.refreshVisualization();
  }

  public updateSelectedObjectQuietly(props: any): void {
    if (!this.selectedObject) return;
    const id = this.selectedObject.id, type = this.selectedObject.type;
    if (type === 'building') { const l = this.worldManifest.getLandmark(id); if (l) { if (props.rotation) l.transform.rotation = props.rotation; if (props.scale) l.transform.scale = props.scale; } }
    else if (type === 'npc') { const n = this.worldManifest.getNPCs().find(n => n.id === id); if (n) { if (props.rotation) n.transform.rotation = props.rotation; if (props.scale) n.transform.scale = props.scale; } }
    else if (type === 'path') { const i = parseInt(id.split('_')[1]), p = this.worldManifest.getPaths()[i]; if (p && props.pathWidth !== undefined) p.width = props.pathWidth; }
    else if (type === 'feature') { const f = this.worldManifest.getTerrainFeatures().find(f => f.id === id); if (f) { if (props.rotation) f.transform.rotation = props.rotation[1]; } }
      // Dispatch select event to update the properties panel numbers without refreshing the whole world
      window.dispatchEvent(new CustomEvent('editor:select', { detail: this.selectedObject }));
  }
    
  public updateSelectedObject(props: any): void {
      if (!this.selectedObject) return;
      const id = this.selectedObject.id, type = this.selectedObject.type;
      if (type === 'building') { const l = this.worldManifest.getLandmark(id); if (l) { if (props.rotation) l.transform.rotation = props.rotation; if (props.scale) l.transform.scale = props.scale; } }
      else if (type === 'npc') { const n = this.worldManifest.getNPCs().find(n => n.id === id); if (n) { if (props.rotation) n.transform.rotation = props.rotation; if (props.scale) n.transform.scale = props.scale; } }
      else if (type === 'path') { const i = parseInt(id.split('_')[1]), p = this.worldManifest.getPaths()[i]; if (p && props.pathWidth !== undefined) p.width = props.pathWidth; }
      else if (type === 'feature') { const f = this.worldManifest.getTerrainFeatures().find(f => f.id === id); if (f) { if (props.rotation) f.transform.rotation = props.rotation[1]; } }
    
    // Apply changes visually directly
    if (props.rotation) {
      if (type === 'building' || type === 'npc') {
        this.selectedObject.group.rotation.set(props.rotation[0], props.rotation[1], props.rotation[2]);
      } else if (type === 'feature') {
        this.selectedObject.group.rotation.y = props.rotation[1];
      }
    }
    if (props.scale) {
      this.selectedObject.group.scale.setScalar(props.scale);
    }


    this.refreshVisualization();
  }

  private getManifestData(): any { return this.worldManifest.toData(); }

  /** Notify the host app that the manifest changed, including where, so it can refresh terrain/spawns at the edit. */
  private notifyManifestChanged(x?: number, z?: number): void {
    // Clear manual spawns because WorldGenerator will rebuild from the manifest
    this.manualSpawns.forEach(obj => {
      this.scene.remove(obj);
      obj.traverse(c => { if (c instanceof THREE.Mesh) c.geometry.dispose(); });
    });
    this.manualSpawns = [];
    
    const em = (this as any).entityManager;
    if (em) {
      this.manualNPCs.forEach(id => em.removeNPC(id));
      this.manualNPCs = [];
    }

    window.dispatchEvent(new CustomEvent('editor:manifest_changed', { detail: { x, z } }));
  }

  // Footprint measurements are stable per type — cache so a save with many
  // same-type buildings only builds the mesh once.
  private static footprintCache = new Map<string, { shape: 'rect'; width: number; depth: number } | null>();

  /**
   * Build a mesh of `type` at scale 1 and measure its XZ footprint, shrunk
   * slightly to approximate the base (stripping roof overhang). Cached per type.
   */
  private measureFootprint(type: string): { shape: 'rect'; width: number; depth: number } | null {
    if (TerrainEditor.footprintCache.has(type)) return TerrainEditor.footprintCache.get(type)!;
    let fp: { shape: 'rect'; width: number; depth: number } | null = null;
    const obj = buildObject(type, new THREE.Vector3(0, 0, 0), 1);
    if (obj) {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (!box.isEmpty() && isFinite(box.min.x)) {
        const size = new THREE.Vector3();
        box.getSize(size);
        fp = {
          shape: 'rect',
          width: Math.max(1, +(size.x * 0.9).toFixed(1)),
          depth: Math.max(1, +(size.z * 0.9).toFixed(1)),
        };
      }
      obj.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    TerrainEditor.footprintCache.set(type, fp);
    return fp;
  }

  /**
   * Pre-save cleanup: remove the inconsistencies that read as bugs in-world
   * before the manifest is persisted. Three classes of fix:
   *   1. Sculpt strokes that form near-vertical jumps — these stretch the
   *      world-tiled ground UVs so badly they look like a missing texture.
   *      Empty (stray-click) strokes are dropped; over-steep raise/lower
   *      deposits are clamped so the brush edge can't exceed ~MAX_SCULPT_SLOPE.
   *   2. Buildings with no footprint spec get an auto-measured one stamped into
   *      metadata.footprint, so they receive a flat pad instead of floating/
   *      tilting ("flying") on sloped ground.
   *   3. Buildings and NPCs whose stored Y drifted from the authoritative
   *      terrain height (e.g. placed at y=0, or the ground was sculpted under
   *      them afterwards) — re-grounded so they sit flush instead of
   *      floating/sinking.
   * Returns a short human-readable list of what was changed (for the toast).
   */
  private sanitizeManifest(): string[] {
    const fixes: string[] = [];

    // ── 1. Clean sculpt strokes (terrain jumps → "missing texture" look) ──────
    // Max gradient of the smoothstep falloff (1 - t²(3-2t)) is 1.5/radius at
    // t=0.5, so the brush edge's steepest slope is 1.5·|delta|/radius. Cap it.
    const MAX_SCULPT_SLOPE = 1.2;          // ≈50°, past this world-tiled UVs stretch badly
    const SMOOTHSTEP_PEAK_GRAD = 1.5;
    const strokes = this.worldManifest.getSculpt();
    let clamped = 0, dropped = 0;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (!s.flatten && Math.abs(s.delta) < 0.05) { strokes.splice(i, 1); dropped++; continue; }
      if (!s.flatten) {
        const maxDelta = (s.radius * MAX_SCULPT_SLOPE) / SMOOTHSTEP_PEAK_GRAD;
        if (Math.abs(s.delta) > maxDelta) { s.delta = Math.sign(s.delta) * maxDelta; clamped++; }
      }
    }
    if (clamped) fixes.push(`smoothed ${clamped} steep sculpt stroke${clamped === 1 ? '' : 's'}`);
    if (dropped) fixes.push(`removed ${dropped} empty sculpt stroke${dropped === 1 ? '' : 's'}`);

    // ── 2. Ensure every building has a footprint so it gets a flat pad ────────
    // Buildings whose type is missing from FOOTPRINT_SPECS get no auto-pad, so on
    // sloped ground they tilt/float ("fly"). Measure the mesh's real footprint
    // once and stamp it into metadata.footprint (already honoured by
    // Terrain.setManifest), which fixes both the editor and the in-game terrain.
    let footprints = 0;
    for (const l of this.worldManifest.getAllLandmarks()) {
      if (l.visual?.metadata?.footprint || FOOTPRINT_SPECS[l.type]) continue;
      const fp = this.measureFootprint(l.type);
      if (!fp) continue;
      if (!l.visual.metadata) l.visual.metadata = {};
      l.visual.metadata.footprint = fp;
      footprints++;
    }
    if (footprints) fixes.push(`padded ${footprints} unpadded building${footprints === 1 ? '' : 's'}`);

    // Push the cleaned topology into the terrain so getHeightAt below samples the
    // corrected surface (incl. building pads) when re-grounding objects.
    this.terrain.setManifest(this.getManifestData());

    // ── 2. Re-ground buildings so they sit flat on the pad ────────────────────
    let buildings = 0;
    for (const l of this.worldManifest.getAllLandmarks()) {
      const gy = this.terrain.getHeightAt(l.transform.position[0], l.transform.position[2]);
      if (Math.abs(l.transform.position[1] - gy) > 0.05) { l.transform.position[1] = gy; buildings++; }
    }
    if (buildings) fixes.push(`re-grounded ${buildings} building${buildings === 1 ? '' : 's'}`);

    // ── 3. Re-ground NPCs ─────────────────────────────────────────────────────
    let npcs = 0;
    for (const n of this.worldManifest.getNPCs()) {
      const gy = this.terrain.getHeightAt(n.transform.position[0], n.transform.position[2]);
      if (Math.abs(n.transform.position[1] - gy) > 0.05) { n.transform.position[1] = gy; npcs++; }
    }
    if (npcs) fixes.push(`re-grounded ${npcs} NPC${npcs === 1 ? '' : 's'}`);

    return fixes;
  }

  public saveManifest(): string[] {
    // Fix visible inconsistencies (floating buildings, missing-texture terrain
    // jumps) before persisting, then re-render so the editor reflects the fixes.
    const fixes = this.sanitizeManifest();
    if (fixes.length > 0) {
      this.refreshVisualization();
      window.dispatchEvent(new CustomEvent('editor:manifest_changed', { detail: {} }));
    }

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
    return fixes;
  }
}
