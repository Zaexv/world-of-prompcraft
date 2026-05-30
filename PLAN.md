# Architecture Plan: Image Capture & 3D Mesh Integration

## 1. Goal
Design and restructure the codebase to support taking images (via webcam or upload) and dynamically adding 3D meshes and characters into the scene. The application will serve as a visual overlay/AR-lite experience using Three.js.

## 2. Proposed Directory Structure
Since the current codebase is largely empty (containing only E2E/visual tests), we will establish a scalable foundation:

```text
client/src/
├── core/
│   ├── engine/           # Three.js core (Scene, Camera, WebGLRenderer)
│   ├── loop/             # RequestAnimationFrame game/render loop
│   └── events/           # Event bus for UI <-> 3D communication
├── features/
│   ├── camera/           # MediaDevices API wrapper (capture image/video stream)
│   ├── meshes/           # Mesh generation, basic shapes, and custom geometries
│   ├── characters/       # Complex grouped meshes, materials, and animations
│   └── composite/        # Logic to merge camera feeds with the Three.js canvas
├── ui/                   # UI Layer (React components or Vanilla HTML/CSS)
│   ├── Viewfinder/       # Camera preview UI
│   ├── Controls/         # Buttons for capturing images and spawning meshes
│   └── Overlay/          # UI elements drawn over the 3D canvas
└── utils/
    ├── geometry-utils.ts # BufferGeometry and manipulation helpers
    └── math-utils.ts     # Vector and Matrix math
```

## 3. Core Components Design

### A. Camera Module (`features/camera`)
- **Responsibility:** Interface with the browser's `navigator.mediaDevices.getUserMedia` to access the webcam.
- **Output:** A `<video>` element feed or a captured `<canvas>` frame that can be fed into Three.js as a `VideoTexture` or a static background texture.

### B. Mesh & Character Module (`features/meshes` & `features/characters`)
- **Responsibility:** Define 3D objects to be placed over the image.
- **Implementation:** 
  - Utilize built-in Three.js primitives (`BoxGeometry`, `SphereGeometry`, etc.) and `BufferGeometry` for custom shapes as defined in our capabilities.
  - Implement an `InstancedMesh` system if multiple identical characters/meshes need to be rendered efficiently.
  - Characters will be composed of hierarchical `THREE.Group` objects.

### C. Compositing System (`features/composite`)
- **Responsibility:** Align the 3D scene with the 2D image background.
- **Implementation:** The Three.js scene background can be set to the captured image texture (`scene.background = new THREE.Texture(image)`), ensuring the 3D objects render natively on top of the captured scene. 

## 4. Execution Steps
1. **Initialize Engine Foundation:** Set up the basic Vite/Three.js environment (`src/core/engine`).
2. **Camera Integration:** Build the module to request webcam permissions and render the feed to the screen.
3. **Mesh Factory:** Implement the foundational classes for generating 3D shapes and characters.
4. **Integration:** Combine the camera feed as the scene background and spawn meshes using UI controls.
5. **Testing:** Update visual E2E tests to validate that both the camera feed (mocked) and the 3D meshes are rendered properly.

## 5. Technology Stack Assumptions
- **Build Tool:** Vite (already in `package.json`)
- **3D Library:** Three.js
- **UI Framework:** Vanilla TS/HTML/CSS (or React/Vue if preferred; please specify).