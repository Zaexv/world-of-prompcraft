import { PlayerRig } from '../PlayerRig';

/**
 * Swimming override: raise the body to the surface and damp the bank lean so the
 * character reads as floating rather than standing.
 */
export function applySwimPose(rig: PlayerRig, bankLean: number): void {
  rig.visualRoot.position.set(0, 0.34, 0);
  rig.visualRoot.rotation.z = bankLean * 0.5;
}
