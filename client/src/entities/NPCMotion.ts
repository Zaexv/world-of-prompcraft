import { lerp } from '../utils/math/MathHelpers';

export type NPCBehavior = 'friendly' | 'neutral' | 'hostile';
export type NPCMovementStyle = 'stroll' | 'patrol' | 'prowl' | 'float' | 'swagger' | 'stomp';

export interface NPCMotionSource {
  id: string;
  name: string;
  color?: number;
  behavior?: NPCBehavior;
  movementStyle?: NPCMovementStyle;
}

export interface NPCMotionProfile {
  style: NPCMovementStyle;
  moveSpeed: number;
  wanderRadius: number;
  pauseMin: number;
  pauseMax: number;
  turnSpeed: number;
  walkCycleSpeed: number;
  idleBobAmplitude: number;
  idleBobSpeed: number;
  swayAmplitude: number;
  swaySpeed: number;
  animationRate: number;
  patrolPoints: number;
}

const BASE_PROFILES: Record<NPCMovementStyle, NPCMotionProfile> = {
  stroll: {
    style: 'stroll',
    moveSpeed: 1.18,
    wanderRadius: 5.5,
    pauseMin: 2.6,
    pauseMax: 5.2,
    turnSpeed: 3.5,
    walkCycleSpeed: 7.8,
    idleBobAmplitude: 0.035,
    idleBobSpeed: 1.9,
    swayAmplitude: 0.03,
    swaySpeed: 1.2,
    animationRate: 0.96,
    patrolPoints: 0,
  },
  patrol: {
    style: 'patrol',
    moveSpeed: 1.42,
    wanderRadius: 7.5,
    pauseMin: 0.9,
    pauseMax: 2.3,
    turnSpeed: 5.4,
    walkCycleSpeed: 8.9,
    idleBobAmplitude: 0.025,
    idleBobSpeed: 1.8,
    swayAmplitude: 0.02,
    swaySpeed: 1.1,
    animationRate: 1.04,
    patrolPoints: 4,
  },
  prowl: {
    style: 'prowl',
    moveSpeed: 1.92,
    wanderRadius: 9.2,
    pauseMin: 0.6,
    pauseMax: 1.7,
    turnSpeed: 6.8,
    walkCycleSpeed: 10.4,
    idleBobAmplitude: 0.045,
    idleBobSpeed: 2.3,
    swayAmplitude: 0.04,
    swaySpeed: 1.8,
    animationRate: 1.08,
    patrolPoints: 0,
  },
  float: {
    style: 'float',
    moveSpeed: 0.98,
    wanderRadius: 4.8,
    pauseMin: 1.8,
    pauseMax: 3.8,
    turnSpeed: 4.2,
    walkCycleSpeed: 6.5,
    idleBobAmplitude: 0.08,
    idleBobSpeed: 1.5,
    swayAmplitude: 0.05,
    swaySpeed: 1.0,
    animationRate: 0.92,
    patrolPoints: 0,
  },
  swagger: {
    style: 'swagger',
    moveSpeed: 1.3,
    wanderRadius: 6.6,
    pauseMin: 1.5,
    pauseMax: 3.1,
    turnSpeed: 4.0,
    walkCycleSpeed: 9.2,
    idleBobAmplitude: 0.03,
    idleBobSpeed: 1.8,
    swayAmplitude: 0.055,
    swaySpeed: 1.5,
    animationRate: 1.0,
    patrolPoints: 0,
  },
  stomp: {
    style: 'stomp',
    moveSpeed: 1.52,
    wanderRadius: 7.0,
    pauseMin: 1.2,
    pauseMax: 2.7,
    turnSpeed: 3.3,
    walkCycleSpeed: 6.9,
    idleBobAmplitude: 0.02,
    idleBobSpeed: 1.35,
    swayAmplitude: 0.02,
    swaySpeed: 0.85,
    animationRate: 0.88,
    patrolPoints: 0,
  },
};

export function createNPCMotionProfile(source: NPCMotionSource): NPCMotionProfile {
  const style = resolveStyle(source);
  const base = BASE_PROFILES[style];
  const seed = hashString(
    `${source.id}|${source.name}|${source.color ?? 0}|${source.behavior ?? ''}|${source.movementStyle ?? ''}`,
  );
  const rand = seededRandom(seed);

  return {
    style,
    moveSpeed: base.moveSpeed * lerp(0.88, 1.14, rand()),
    wanderRadius: base.wanderRadius * lerp(0.84, 1.18, rand()),
    pauseMin: base.pauseMin * lerp(0.8, 1.1, rand()),
    pauseMax: base.pauseMax * lerp(0.85, 1.2, rand()),
    turnSpeed: base.turnSpeed * lerp(0.88, 1.16, rand()),
    walkCycleSpeed: base.walkCycleSpeed * lerp(0.9, 1.12, rand()),
    idleBobAmplitude: base.idleBobAmplitude * lerp(0.85, 1.18, rand()),
    idleBobSpeed: base.idleBobSpeed * lerp(0.88, 1.16, rand()),
    swayAmplitude: base.swayAmplitude * lerp(0.85, 1.18, rand()),
    swaySpeed: base.swaySpeed * lerp(0.88, 1.16, rand()),
    animationRate: base.animationRate * lerp(0.92, 1.08, rand()),
    patrolPoints: base.patrolPoints,
  };
}

function resolveStyle(source: NPCMotionSource): NPCMovementStyle {
  if (source.movementStyle) return source.movementStyle;

  const id = source.id.toLowerCase();
  const name = source.name.toLowerCase();

  if (source.behavior === 'hostile') {
    if (id.includes('guard') || id.includes('sentinel')) return 'patrol';
    if (id.includes('dragon') || id.includes('orc') || id.includes('dungeon') || id.includes('enemy')) {
      return 'stomp';
    }
    return 'prowl';
  }

  if (id.includes('guard') || id.includes('sentinel') || name.includes('guard')) return 'patrol';
  if (id.includes('mage') || id.includes('sage') || id.includes('healer') || name.includes('mage') || name.includes('sage')) {
    return 'float';
  }
  if (id.includes('merchant') || id.includes('citizen') || id.includes('traveler') || name.includes('merchant')) {
    return 'stroll';
  }
  if (id.includes('dragon') || id.includes('orc') || id.includes('enemy') || name.includes('dragon')) return 'stomp';
  if (source.behavior === 'friendly') return 'stroll';
  if (source.behavior === 'neutral') return 'swagger';

  const styles: NPCMovementStyle[] = ['stroll', 'patrol', 'prowl', 'float', 'swagger', 'stomp'];
  return styles[hashString(`${source.id}|${source.name}`) % styles.length];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}
