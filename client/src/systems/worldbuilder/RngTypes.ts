/** Minimal interface for a seeded pseudo-random number generator. */
export interface Rng {
  next(): number;
  nextInt(n: number): number;
  nextRange(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
}
