// Civilian life. Every number the town simulation uses lives here.

import type { BldKey } from './buildings.ts';
import type { Tier } from '../sim/types.ts';

export const CIV = {
  /** Residents a settlement houses on its own. */
  baseHousing: 6,
  /** Residents each finished House adds. */
  houseHousing: 5,
  /** Hard cap per settlement, for performance. */
  maxPerTown: 24,
  /** Residents a new settlement starts with. */
  starting: 3,
  /** Seconds between new residents when the town can grow. */
  growEvery: 18,
  /** Seconds a town must be free of enemies before it counts as safe. */
  safeAfter: 20,
  /** Seconds after danger before the town reads as stable again. */
  recoverAfter: 60,
  /** Enemies this close to a villager make it run. */
  fleeRadius: 56,
  /** Enemies this close to the settlement put the town under attack. */
  dangerRadius: 90,
  /** Seconds between a villager picking a new place to be. */
  wanderMin: 5,
  wanderMax: 11,
  /** How far villagers drift from a workplace, their home, or the center. */
  wanderRadius: 12,
  /** Ticks between civilian passes. */
  every: 30,
  /** Buildings closer than this to a settlement belong to it when there are no regions. */
  reach: 96,
};

/** Job slots and gold per second per filled slot. */
export const JOBS: Partial<Record<BldKey, { slots: number; income: number }>> = {
  farm: { slots: 2, income: 0.35 },
  market: { slots: 4, income: 0.4 },
  smith: { slots: 1, income: 0.25 },
  castle: { slots: 1, income: 0.2 },
  dock: { slots: 2, income: 0.3 },
  port: { slots: 4, income: 0.45 },
};

/** Settlement jobs by tier: the town itself keeps a few people busy. */
export const TOWN_JOBS: Record<Tier, { slots: number; income: number }> = {
  outpost: { slots: 0, income: 0 },
  village: { slots: 3, income: 0.3 },
  town: { slots: 4, income: 0.3 },
  fortress: { slots: 4, income: 0.3 },
  city: { slots: 6, income: 0.35 },
  camp: { slots: 0, income: 0 },
  ruin: { slots: 0, income: 0 },
};
