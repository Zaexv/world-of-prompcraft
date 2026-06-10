import { PlayerRig, lerp } from '../PlayerRig';

/**
 * Sailing / helming pose, blended over the normal animation by `blend` (0..1):
 * hands forward on the rigging with a gentle steering sway, legs braced wide,
 * torso leaning into the wind, standing toward the bow.
 */
export function applySailingPose(rig: PlayerRig, blend: number, idlePhase: number): void {
  if (blend <= 0.001) return;
  const b = blend;
  const sway = Math.sin(idlePhase * 1.5) * 0.06;

  if (rig.leftArm) {
    rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -1.05 + sway, b);
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, 0.32, b);
  }
  if (rig.rightArm) {
    rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, -0.8 - sway, b);
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, -0.32, b);
  }
  if (rig.leftLeg) {
    rig.leftLeg.rotation.x = lerp(rig.leftLeg.rotation.x, 0.2, b);
    rig.leftLeg.rotation.z = lerp(rig.leftLeg.rotation.z, 0.13, b);
  }
  if (rig.rightLeg) {
    rig.rightLeg.rotation.x = lerp(rig.rightLeg.rotation.x, -0.28, b);
    rig.rightLeg.rotation.z = lerp(rig.rightLeg.rotation.z, -0.13, b);
  }
  rig.visualRoot.rotation.x = lerp(rig.visualRoot.rotation.x, -0.22, b);
  rig.visualRoot.position.z = lerp(rig.visualRoot.position.z, 0.14 * b, b);
  if (rig.head) rig.head.rotation.x = lerp(rig.head.rotation.x, 0.08, b);
}
