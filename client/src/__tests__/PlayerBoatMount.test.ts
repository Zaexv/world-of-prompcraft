import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Player } from '../entities/Player';

describe('Player boat mount', () => {
  it('toggles boat mount visibility with water state', () => {
    const player = new Player('night_elf');
    const boat = player.group.getObjectByName('playerBoatMount');

    expect(boat).toBeTruthy();
    expect(boat?.visible).toBe(false);

    player.update(0.016, false, new THREE.Vector3(0, 0, 0), true, null);
    expect(boat?.visible).toBe(true);

    player.update(0.016, false, new THREE.Vector3(0, 0, 0), false, null);
    expect(boat?.visible).toBe(false);
  });
});
