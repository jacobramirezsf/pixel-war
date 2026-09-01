// Sight radii in tiles. Fog of war uses these for the player's side.

import type { UnitDef } from './units.ts';

export function unitVision(T: UnitDef): number {
  if (T.sight) return T.sight;
  if (T.role === 'scout') return 11;
  if (T.fly) return 9;
  return 6 + Math.floor(T.range / 8);
}

export const VISION = {
  settlement: 8,
  tower: 7,
  building: 4,
  /** Ticks between explored-map updates. */
  every: 10,
};
