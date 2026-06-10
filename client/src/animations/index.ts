/**
 * Animation modules, decoupled from the entities they drive.
 *
 * - `PlayerRig`     — the bones/parts an animation may move + shared math.
 * - `PlayerAnimator`— owns per-frame state and orchestrates the player's pose.
 * - `poses/*`       — individual, composable pose functions (locomotion, swim,
 *                     sailing, …). Add new animations here.
 */
export type { PlayerRig } from './PlayerRig';
export { extractPlayerRig } from './PlayerRig';
export { PlayerAnimator } from './PlayerAnimator';
export type { AnimInput } from './PlayerAnimator';
export { applyLocomotion } from './poses/locomotion';
export { applySwimPose } from './poses/swim';
export { applySailingPose } from './poses/sailing';
