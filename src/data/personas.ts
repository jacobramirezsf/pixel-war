// Kingdom personalities. Each race leans a way; difficulty still sets how well it plays.

import type { RaceKey } from './races.ts';

export interface Persona {
  name: string;
  /** Multipliers on the difficulty profile. */
  expands: number;
  harass: number;
  massRatio: number;
  /** Attitude drift per second toward everyone. Negative means quick to anger. */
  temper: number;
  /** How readily it allies: threshold on attitude. */
  allyAt: number;
  /** Chance weight for building towers. */
  builds: number;
}

export const PERSONAS: Record<RaceKey, Persona> = {
  kingdom: { name: 'opportunist', expands: 1.0, harass: 1.0, massRatio: 1.0, temper: 0, allyAt: 40, builds: 1.0 },
  horde:   { name: 'aggressive',  expands: 1.3, harass: 1.6, massRatio: 0.85, temper: -0.03, allyAt: 60, builds: 0.6 },
  undead:  { name: 'raider',      expands: 0.9, harass: 1.8, massRatio: 0.95, temper: -0.01, allyAt: 55, builds: 0.8 },
  forge:   { name: 'defensive',   expands: 0.8, harass: 0.6, massRatio: 1.25, temper: 0.01, allyAt: 35, builds: 1.8 },
  wild:    { name: 'grower',      expands: 1.2, harass: 0.8, massRatio: 1.1, temper: 0.02, allyAt: 30, builds: 1.0 },
};

export const MOODS: [number, string][] = [[50, 'friendly'], [20, 'warm'], [-20, 'neutral'], [-50, 'wary'], [-101, 'hostile']];
export function moodOf(att: number): string {
  for (const [at, name] of MOODS) if (att >= at) return name;
  return 'hostile';
}
