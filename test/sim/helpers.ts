import { BUILTIN, builtinByName } from '../../src/data/maps.ts';
import { applyCommand, cmd, issue } from '../../src/sim/commands.ts';
import { newGame, type GameConfig } from '../../src/sim/game.ts';
import type { MapDef } from '../../src/sim/map.ts';
import { idsOf, unitsOf } from '../../src/sim/queries.ts';
import { step } from '../../src/sim/step.ts';
import type { Action, Mode, World } from '../../src/sim/types.ts';
import { DT } from '../../src/sim/world.ts';

export { DT, applyCommand, cmd };

export function mapNamed(name: string): MapDef {
  const m = builtinByName(name);
  if (!m) throw new Error('no map ' + name);
  return m;
}

export function game(mode: Mode, map: MapDef | string = BUILTIN[0], cfg?: GameConfig): World {
  return newGame(typeof map === 'string' ? mapNamed(map) : map, mode, { seed: 1, ...cfg });
}

/** Issue an action for a slot right now. */
export function act(w: World, slot: number, a: Action): boolean {
  return issue(w, cmd(w, slot, a));
}

export const buy = (w: World, slot: number, unit: import('../../src/data/units.ts').UnitKey): boolean => act(w, slot, { type: 'buy', payload: { unit } });
export const place = (w: World, slot: number, unit: import('../../src/data/units.ts').UnitKey, x: number, y: number): boolean => act(w, slot, { type: 'place', payload: { unit, x, y } });
export const buildAt = (w: World, slot: number, x: number, y: number, bld: import('../../src/data/buildings.ts').BldKey): boolean => act(w, slot, { type: 'build', payload: { x, y, bld } });
export const chargeAll = (w: World, slot: number): boolean => act(w, slot, { type: 'attack', payload: { ids: idsOf(unitsOf(w, slot)), target: null } });
export const moveAll = (w: World, slot: number, x: number, y: number): boolean => act(w, slot, { type: 'move', payload: { ids: idsOf(unitsOf(w, slot)), x, y } });

/** Remove every building, for tests that lay out their own walls. */
export function clearBlds(w: World): void {
  w.blds = [];
  w.bmap.clear();
  w.flowDirty = true;
}

/** Step for `seconds` of sim time or until the game ends. Returns elapsed seconds. */
export function run(w: World, seconds: number, fn?: (t: number) => void): number {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && !w.over; i++) {
    if (fn) fn(w.t);
    step(w);
  }
  return w.t;
}

export function ticks(w: World, n: number): void {
  for (let i = 0; i < n; i++) step(w);
}

/** Fires exactly once per `period` seconds of sim time, judged in whole ticks. */
export function every(t: number, period: number): boolean {
  return Math.round(t / DT) % Math.round(period / DT) === 0;
}
