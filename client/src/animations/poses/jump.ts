import { PlayerRig, lerp } from '../PlayerRig';

/**
 * Board-jump / leap pose, blended by `t` (0..1, peak at the apex of the jump):
 * knees tuck up, arms swing up for balance, torso curls forward — a clear "leap
 * into the boat". Used during the board/leave transition.
 */
export function applyJumpPose(rig: PlayerRig, t: number): void {
  if (t <= 0.001) return;
  // Knees tuck toward the chest at the apex.
  if (rig.leftLeg) rig.leftLeg.rotation.x = lerp(rig.leftLeg.rotation.x, 1.1, t);
  if (rig.rightLeg) rig.rightLeg.rotation.x = lerp(rig.rightLeg.rotation.x, 1.3, t);
  // Arms thrown up/out for balance.
  if (rig.leftArm) {
    rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -1.6, t);
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, 0.5, t);
  }
  if (rig.rightArm) {
    rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, -1.6, t);
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, -0.5, t);
  }
  // Slight forward curl.
  rig.visualRoot.rotation.x = lerp(rig.visualRoot.rotation.x, -0.3, t);
  if (rig.head) rig.head.rotation.x = lerp(rig.head.rotation.x, 0.15, t);
}
