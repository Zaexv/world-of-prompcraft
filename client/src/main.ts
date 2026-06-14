import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { LoginScreen } from './ui/LoginScreen';
import { bootstrap } from './core/GameBootstrapper';
import { createLoadingOverlay } from './ui/LoadingOverlay';

// Monkey-patch THREE with BVH support
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Load Cinzel font early so it's available for the login screen
if (!document.querySelector('link[href*="Cinzel"]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap';
  document.head.appendChild(link);
}

const app = document.getElementById('app')!;

// Benchmark mode: `?benchmark` boots the full engine (same shader warmup + load
// path) and runs an automated FPS stress tour instead of the login flow.
if (new URLSearchParams(window.location.search).has('benchmark')) {
  void import('./benchmark/BenchmarkRunner').then(({ runBenchmark }) => runBenchmark(app));
} else {
  const loginScreen = new LoginScreen();
  loginScreen.show();

  loginScreen.onEnterWorld = (username: string, race: string, faction: string) => {
    const loadingOverlay = createLoadingOverlay(app);
    void bootstrap({ username, race, faction }, app, loadingOverlay, loginScreen).then((engine) => {
      engine.start();
    });
  };
}

