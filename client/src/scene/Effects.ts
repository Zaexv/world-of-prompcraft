import * as THREE from 'three';

/* ================================================================== */
/*  Effects — environmental effects (Tabula Rasa: empty for now)       */
/* ================================================================== */
export class Effects {
  /* ---------------------------------------------------------------- */
  constructor(_scene: THREE.Scene) {}

  /** Update the player position so effects stay near the camera. */
  setPlayerPosition(_x: number, _z: number): void {
    // No effects to update
  }

  /* ================================================================ */
  /*  UPDATE                                                          */
  /* ================================================================ */
  update(_delta: number): void {
    // No effects to update
  }
}
