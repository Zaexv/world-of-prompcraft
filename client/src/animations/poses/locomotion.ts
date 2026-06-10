import { PlayerRig, lerp, clampedT } from '../PlayerRig';

export interface LocomotionInput {
  delta: number;
  isMoving: boolean;
  isRunning: boolean;
  walkPhase: number;
  breathPhase: number;
  idlePhase: number;
  /** Smoothed arm-raise state, owned by the caller. */
  armRaise: number;
}

/**
 * Walk / run / idle limb animation. Legs stride from the hip, arms swing
 * contralaterally, the head nods with breath. Returns the new `armRaise` so the
 * caller can keep smoothing it across frames.
 */
export function applyLocomotion(rig: PlayerRig, input: LocomotionInput): number {
  const { delta, isMoving, isRunning, walkPhase, breathPhase, idlePhase } = input;
  const stride = Math.sin(walkPhase);
  const legAmp = isRunning ? 0.85 : 0.55;
  const breathNod = Math.sin(breathPhase) * 0.02;
  const idleFidget = Math.sin(idlePhase * 2.3) * (isMoving ? 0 : 0.008);

  if (rig.leftLeg) rig.leftLeg.rotation.x = stride * legAmp;
  if (rig.rightLeg) rig.rightLeg.rotation.x = -stride * legAmp;

  const targetArmRaise = isRunning ? -0.45 : 0;
  const armRaise = lerp(input.armRaise, targetArmRaise, clampedT(delta, 4));
  const armAmp = isRunning ? 0.7 : 0.5;
  const splay = isMoving ? 0.12 : 0.05;

  if (rig.leftArm) {
    rig.leftArm.rotation.x = -stride * armAmp + armRaise;
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -splay, clampedT(delta, 4));
  }
  if (rig.rightArm) {
    rig.rightArm.rotation.x = stride * armAmp + armRaise;
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, splay, clampedT(delta, 4));
  }

  if (rig.head) {
    rig.head.rotation.x = breathNod + idleFidget + (isMoving ? Math.abs(Math.cos(walkPhase)) * 0.03 : 0);
    rig.head.rotation.y = lerp(rig.head.rotation.y, isMoving ? 0 : Math.sin(idlePhase * 0.7) * 0.08, clampedT(delta, 2));
    rig.head.rotation.z = lerp(rig.head.rotation.z, isMoving ? -stride * 0.03 : 0, clampedT(delta, 5));
  }

  return armRaise;
}
