// Seeded PRNG (mulberry32). The state is a plain object so it snapshots with the world.

export interface Rng {
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** Next float in [0, 1). */
export function rand(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Float in [a, b). */
export function rnd(r: Rng, a: number, b: number): number {
  return a + rand(r) * (b - a);
}

/** Integer in [0, n). */
export function randInt(r: Rng, n: number): number {
  return (rand(r) * n) | 0;
}
