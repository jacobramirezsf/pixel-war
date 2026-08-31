// A replay is a seed, the game setup, and the command log. Nothing else.

import type { DiffKey } from '../data/difficulty.ts';
import type { RaceKey } from '../data/races.ts';
import { newGame } from './game.ts';
import { decodeMap, encodeMap, type MapDef } from './map.ts';
import { step } from './step.ts';
import type { Command, Mode, World } from './types.ts';

export interface Replay {
  v: 1;
  seed: number;
  mode: Mode;
  mapName: string;
  mapCode: string;
  allies: number[];
  diff: DiffKey;
  ai: boolean[];
  races: RaceKey[];
  instant?: boolean;
  commands: Command[];
  /** Tick the recording stopped at. */
  ticks: number;
}

export interface GameSetup {
  seed: number;
  mode: Mode;
  map: MapDef;
  allies: number[];
  diff: DiffKey;
  ai: boolean[];
  races: RaceKey[];
  instant?: boolean;
}

export function setupWorld(s: GameSetup): World {
  return newGame(s.map, s.mode, { allies: s.allies, diff: s.diff, seed: s.seed, ai: s.ai, races: s.races, instant: s.instant });
}

export function recordReplay(w: World, s: GameSetup): Replay {
  return {
    v: 1, seed: s.seed, mode: s.mode, mapName: s.map.name, mapCode: encodeMap(s.map),
    allies: s.allies.slice(), diff: s.diff, ai: s.ai.slice(), races: s.races.slice(), instant: s.instant, commands: w.log.map((c) => JSON.parse(JSON.stringify(c)) as Command), ticks: w.tick,
  };
}

/** Rebuild the world from a replay and run it to the recorded tick, or to `untilTick`. */
export function runReplay(r: Replay, untilTick = r.ticks): World {
  const map = decodeMap(r.mapCode);
  map.name = r.mapName;
  const w = newGame(map, r.mode, { allies: r.allies, diff: r.diff, seed: r.seed, ai: r.ai, races: r.races, instant: r.instant });
  w.queue = r.commands.map((c) => JSON.parse(JSON.stringify(c)) as Command);
  while (w.tick < untilTick) step(w);
  return w;
}
