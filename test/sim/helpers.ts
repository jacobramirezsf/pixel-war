import { BUILTIN, builtinByName } from '../../src/data/maps.ts';
import { newGame, type GameConfig } from '../../src/sim/game.ts';
import type { MapDef } from '../../src/sim/map.ts';
import { step } from '../../src/sim/step.ts';
import type { Mode, World } from '../../src/sim/types.ts';

export const DT = 1 / 60;

export function mapNamed(name: string): MapDef {
  const m = builtinByName(name);
  if (!m) throw new Error('no map ' + name);
  return m;
}

export function game(mode: Mode, map: MapDef | string = BUILTIN[0], cfg?: GameConfig): World {
  return newGame(typeof map === 'string' ? mapNamed(map) : map, mode, { seed: 1, ...cfg });
}

/** Step for `seconds` of sim time or until the game ends. Returns elapsed seconds. */
export function run(w: World, seconds: number, fn?: (t: number) => void): number {
  let t = 0;
  while (t < seconds && !w.over) {
    if (fn) fn(t);
    step(w, DT);
    t += DT;
  }
  return t;
}

export function ticks(w: World, n: number): void {
  for (let i = 0; i < n; i++) step(w, DT);
}

/** Fires once per `every` seconds of sim time, like the prototype's `Math.abs(t%8)<0.02` checks. */
export function every(t: number, period: number): boolean {
  return Math.abs(t % period) < 0.02;
}
