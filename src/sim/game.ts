// Starting a game in any mode.

import type { DiffKey } from '../data/difficulty.ts';
import { buildFort } from './buildings.ts';
import { cloneMap, type MapDef } from './map.ts';
import { mkBases } from './mapgen.ts';
import type { Mode, World } from './types.ts';
import { diffDef, reset, say } from './world.ts';

export interface GameConfig {
  allies?: number[];
  diff?: DiffKey;
  seed?: number;
  /** Which slots the built-in AI drives. Default: all but slot 0. AI slots start with a fort. */
  ai?: boolean[];
}

/** Copy of the chosen map, with extra bases placed for 3 to 5 players. */
export function prepareMap(map: MapDef, nP: number): MapDef {
  const m = cloneMap(map, map.name);
  return nP > 2 ? mkBases(m, nP) : m;
}

export function newGame(map: MapDef, mode: Mode, cfg?: GameConfig): World {
  const allies = cfg?.allies ?? [0, 1];
  const w = reset(prepareMap(map, allies.length), { allies, diff: cfg?.diff ?? 'std', seed: cfg?.seed, ai: cfg?.ai });
  w.mode = mode;
  if (mode === 'sand') {
    w.phase = 'edit';
    w.cap = 80;
  } else {
    if (mode === 'rich') { w.slots[0].gold = Infinity; w.cap = 60; }
    const d = diffDef(w);
    for (let i = 0; i < w.nP; i++) if (w.slots[i].ai) buildFort(w, i, d.wall, d.twr, d.extra);
  }
  w.flowDirty = true;
  say(
    w,
    mode === 'sand' ? 'Pick a unit below, tap the map to place it'
      : mode === 'dom' ? 'Hold the mines. First to 150 points.'
      : mode === 'multi' ? (w.nP - 1) + ' rivals on the field. Last alliance standing.'
      : 'Build units and walls. First wave in ' + Math.ceil(w.wave) + 's.',
    3,
  );
  return w;
}
