// What to buy. A role counter matrix bends a baseline by what the enemy actually fields.
// Roles come from data/units.ts. The matrix reads: for each enemy role (row), how much more of
// each own role (column) to buy. Rows are the enemy, columns the answer.
//
//            line  ranged  fast  siege  heavy  air  support
//   line     0.8   1.6     0.9   1.4    1.1    1.0  1.0     ranged and splash beat massed line
//   ranged   1.1   0.7     1.8   0.6    1.2    1.3  0.9     fast units run down archers
//   fast     1.8   0.6     0.8   0.5    1.2    0.8  0.9     spears and shields stop cavalry
//   siege    1.2   0.9     1.7   0.6    0.8    1.4  0.9     reach the mortars fast
//   heavy    0.7   1.6     0.7   1.5    0.9    0.9  1.1     armor piercing and splash
//   air      0.6   1.9     0.6   0.5    0.6    1.0  0.9     only ranged hits drones
//   support  1.0   1.0     1.5   1.0    1.0    1.0  0.8     assassins for medics

import { roster, TYPES, type Role, type UnitKey } from '../../data/units.ts';
import type { RaceKey } from '../../data/races.ts';
import { rand, type Rng } from '../rng.ts';

export const ROLES: Role[] = ['line', 'ranged', 'fast', 'siege', 'heavy', 'air', 'support'];

export const COUNTER: Record<Role, Partial<Record<Role, number>>> = {
  line:    { line: 0.8, ranged: 1.6, fast: 0.9, siege: 1.4, heavy: 1.1, air: 1.0, support: 1.0 },
  ranged:  { line: 1.1, ranged: 0.7, fast: 1.8, siege: 0.6, heavy: 1.2, air: 1.3, support: 0.9 },
  fast:    { line: 1.8, ranged: 0.6, fast: 0.8, siege: 0.5, heavy: 1.2, air: 0.8, support: 0.9 },
  siege:   { line: 1.2, ranged: 0.9, fast: 1.7, siege: 0.6, heavy: 0.8, air: 1.4, support: 0.9 },
  heavy:   { line: 0.7, ranged: 1.6, fast: 0.7, siege: 1.5, heavy: 0.9, air: 0.9, support: 1.1 },
  air:     { line: 0.6, ranged: 1.9, fast: 0.6, siege: 0.5, heavy: 0.6, air: 1.0, support: 0.9 },
  support: { line: 1.0, ranged: 1.0, fast: 1.5, siege: 1.0, heavy: 1.0, air: 1.0, support: 0.8 },
  scout:   {},
  special: {},
};

/** Baseline role mix by game time. Cheap line early, heavier and more siege later. */
export function baseline(t: number): Record<Role, number> {
  const late = Math.min(1, t / 240);
  return {
    line: 3 - 1.5 * late, ranged: 2 + 0.5 * late, fast: 1 + 0.5 * late, siege: 0.3 + 1.2 * late,
    heavy: 0.2 + 1.3 * late, air: 0.4 + 0.4 * late, support: 0.6, scout: 0.3 * (1 - late), special: 0.5 + 0.8 * late,
  };
}

/** Enemy army value split by role, normalized to sum 1. Empty when there is no army. */
export function roleMix(units: readonly { type: UnitKey }[]): Partial<Record<Role, number>> {
  const out: Partial<Record<Role, number>> = {};
  let tot = 0;
  for (const u of units) { const T = TYPES[u.type]; out[T.role] = (out[T.role] ?? 0) + T.cost; tot += T.cost; }
  if (tot) for (const k of Object.keys(out) as Role[]) out[k] = out[k]! / tot;
  return out;
}

/** Role weights after bending the baseline by the enemy mix. `strength` 0..1 is the profile's counter setting. */
export function roleWeights(t: number, enemy: Partial<Record<Role, number>>, strength: number, fortified = false): Record<Role, number> {
  const base = baseline(t);
  const out = { ...base };
  if (fortified) { out.siege *= 2.2; out.ranged *= 1.4; out.heavy *= 1.4; out.fast *= 0.7; }
  for (const r of Object.keys(base) as Role[]) {
    let mult = 1;
    for (const er of Object.keys(enemy) as Role[]) {
      const c = COUNTER[er]?.[r];
      if (c !== undefined) mult += (c - 1) * enemy[er]! * strength;
    }
    out[r] = base[r] * Math.max(0.1, mult);
  }
  return out;
}

/**
 * Pick a unit to buy. Roles are weighted, then a unit of that role is chosen by cost fit:
 * expensive units are favored only when the treasury can carry them.
 */
export function pickUnit(rng: Rng, race: RaceKey, t: number, gold: number, enemy: Partial<Record<Role, number>>, strength: number, exclude: (k: UnitKey) => boolean, fortified = false): UnitKey | null {
  const list = roster(race).filter((k) => !exclude(k) && !TYPES[k].repair);
  if (!list.length) return null;
  const rw = roleWeights(t, enemy, strength, fortified);
  const budget = Math.max(30, gold + 20);
  const wts = list.map((k) => {
    const T = TYPES[k];
    const fit = T.cost > budget ? 0.05 : 1 - (T.cost / budget) * 0.5;
    return (rw[T.role] ?? 0.5) * fit;
  });
  let r = rand(rng) * wts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= wts[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}
