// Difficulty as decision quality. Income is a small secondary lever.

import type { DiffKey } from '../../data/difficulty.ts';

export interface AiProfile {
  /** Seconds between decisions. */
  react: number;
  /** How much the counter matrix bends purchases. 0 ignores the enemy army. */
  counter: number;
  /** Pull losing groups back to heal. */
  retreats: boolean;
  /** Send units to hold mines and answer raids on them. */
  defendsMines: boolean;
  /** Split pushes across two targets. */
  multiProng: boolean;
  /** Take uncontested mines early and often. */
  expands: number;
  /** Attack when own army value reaches this multiple of the defense at the target. */
  massRatio: number;
  /** Never push with fewer units than this. Easy trickles, the rest gather. */
  minWave: number;
  /** Seconds after which a gathered army goes anyway. */
  pushEvery: number;
  /** Chance per decision to raid an undefended mine with fast units. */
  harass: number;
  /** Buys towers when gold is idle and a threat is near. */
  builds: boolean;
  /** New units join a push already under way instead of waiting for the next one. */
  reinforces: boolean;
  income: number;
  /** Production speed multiplier. The second small lever next to income. */
  build: number;
}

export const PROFILES: Record<DiffKey, AiProfile> = {
  easy: { react: 6, counter: 0, retreats: false, defendsMines: false, multiProng: false, expands: 0.2, massRatio: 0.4, minWave: 3, pushEvery: 30, builds: false, harass: 0, reinforces: false, income: 0.8, build: 0.7 },
  std:  { react: 3, counter: 0.5, retreats: false, defendsMines: true, multiProng: false, expands: 0.5, massRatio: 1.3, minWave: 8, pushEvery: 90, builds: true, harass: 0.1, reinforces: false, income: 1.2, build: 1.0 },
  hard: { react: 1.5, counter: 1, retreats: true, defendsMines: true, multiProng: false, expands: 0.6, massRatio: 1.2, minWave: 9, pushEvery: 100, builds: true, harass: 0.2, reinforces: false, income: 1.4, build: 1.25 },
  ext:  { react: 0.5, counter: 1, retreats: true, defendsMines: true, multiProng: true, expands: 0.5, massRatio: 1.1, minWave: 10, pushEvery: 100, builds: true, harass: 0.25, reinforces: true, income: 1.7, build: 1.5 },
};
