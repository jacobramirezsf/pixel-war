// Run one bot-versus-bot match headless.

import type { DiffKey } from '../../data/difficulty.ts';
import type { RaceKey } from '../../data/races.ts';
import type { MapDef } from '../map.ts';
import { enqueue, stateHash } from '../world.ts';
import { step } from '../step.ts';
import { newGame } from '../game.ts';
import { BOT_PERIOD, BOTS, type Bot } from './bots.ts';
import type { World } from '../types.ts';

export interface MatchOpts {
  map: MapDef;
  a: Bot | string;
  b: Bot | string;
  seed: number;
  diff?: DiffKey;
  /** Per-slot difficulty for AI slots, for ladder tests. */
  diffs?: [DiffKey, DiffKey];
  races?: [RaceKey, RaceKey];
  /** Sim seconds before the match is called a draw. */
  maxSec?: number;
}

export interface MatchResult {
  winner: 0 | 1 | null;
  time: number;
  ticks: number;
  hash: string;
}

function bot(b: Bot | string): Bot {
  if (typeof b !== 'string') return b;
  const x = BOTS[b];
  if (!x) throw new Error('unknown bot ' + b + '. Bots: ' + Object.keys(BOTS).join(', '));
  return x;
}

export function runMatch(o: MatchOpts): MatchResult {
  const A = bot(o.a), B = bot(o.b);
  const w = newGame(o.map, 'skirmish', { seed: o.seed, diff: o.diff ?? 'std', ai: [A.name === 'ai', B.name === 'ai'], diffs: o.diffs, races: o.races });
  const maxTicks = Math.round((o.maxSec ?? 480) * 60);
  runBots(w, [A, B], maxTicks);
  return { winner: w.over === 'win' ? 0 : w.over === 'lose' ? 1 : null, time: w.t, ticks: w.tick, hash: stateHash(w) };
}

/** Drive a world with one bot per slot until it ends or `maxTicks` pass. */
export function runBots(w: World, bots: Bot[], maxTicks: number): void {
  while (!w.over && w.tick < maxTicks) {
    if (w.tick % BOT_PERIOD === 0) for (let i = 0; i < bots.length; i++) for (const c of bots[i].act(w, i)) enqueue(w, c);
    step(w);
  }
}
