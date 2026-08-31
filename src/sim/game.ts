// Starting a game in any mode.

import type { DiffKey } from '../data/difficulty.ts';
import type { RaceKey } from '../data/races.ts';
import { buildFort } from './buildings.ts';
import { makeRegions, regionAt, TIERS } from './conquest.ts';
import { cloneMap, finishMap, type MapDef } from './map.ts';
import { gen, mkBases } from './mapgen.ts';
import { makeRng } from './rng.ts';
import type { Mode, World } from './types.ts';
import { reset, say, slotDiff } from './world.ts';

export interface GameConfig {
  allies?: number[];
  diff?: DiffKey;
  seed?: number;
  /** Which slots the built-in AI drives. Default: all but slot 0. AI slots start with a fort. */
  ai?: boolean[];
  races?: RaceKey[];
  diffs?: DiffKey[];
}

/** Copy of the chosen map, with extra bases placed for 3 to 5 players. */
export function prepareMap(map: MapDef, nP: number): MapDef {
  const m = cloneMap(map, map.name);
  return nP > 2 ? mkBases(m, nP) : m;
}

/** The slice world: 40x40, mines at the four edges, capitals in opposite corners. */
export function conquestMap(seed: number): MapDef {
  const m = gen({ name: 'Conquest', cols: 40, rows: 40, seed, road: false, tree: 0.6, rock: 0.5, water: 0.35, mines: [[6, 20], [33, 20], [20, 6], [19, 33]] });
  m.bases = [{ tx: 5, ty: 34 }, { tx: 34, ty: 5 }];
  return finishMap(m);
}

export function newGame(map: MapDef, mode: Mode, cfg?: GameConfig): World {
  if (mode === 'conquest') return newConquest(cfg);
  const allies = cfg?.allies ?? [0, 1];
  const w = reset(prepareMap(map, allies.length), { allies, diff: cfg?.diff ?? 'std', seed: cfg?.seed, ai: cfg?.ai, races: cfg?.races, diffs: cfg?.diffs });
  w.mode = mode;
  if (mode === 'sand') {
    w.phase = 'edit';
    w.cap = 80;
  } else {
    if (mode === 'rich') { w.slots[0].gold = Infinity; w.cap = 60; }
    for (let i = 0; i < w.nP; i++) if (w.slots[i].ai) { const d = slotDiff(w, i); buildFort(w, i, d.wall, d.twr, d.extra); }
  }
  w.flowDirty = true;
  finishSetup(w, mode);
  return w;
}

function finishSetup(w: World, mode: Mode): void {
  say(
    w,
    mode === 'sand' ? 'Pick a unit below, tap the map to place it'
      : mode === 'dom' ? 'Hold the mines. First to 150 points.'
      : mode === 'multi' ? (w.nP - 1) + ' rivals on the field. Last alliance standing.'
      : 'Build units and walls. The enemy is gathering.',
    3,
  );
}

export function newConquest(cfg?: GameConfig): World {
  const seed = cfg?.seed ?? 1;
  const map = conquestMap(seed);
  const w = reset(map, { allies: [0, 1], diff: cfg?.diff ?? 'std', seed, ai: [false, true], races: cfg?.races ?? ['kingdom', 'kingdom'], diffs: cfg?.diffs });
  w.mode = 'conquest';
  w.cap = 40;
  w.rules = { upkeep: true, connection: true, garrison: true, unrest: false };
  const { regions, regionOf } = makeRegions(map, makeRng(seed ^ 0x9e3779b9));
  w.regions = regions;
  w.regionOf = regionOf;
  for (let i = 0; i < w.nP; i++) {
    const b = w.slots[i].settlements[0];
    b.tier = 'village';
    b.max = TIERS.village.hp;
    b.hp = b.max;
    b.region = regionAt(w, b.x, b.y);
    w.capitals[i] = b.region;
    regions[b.region].owner = i;
    regions[b.region].claimant = i;
    w.slots[i].gold = 200;
  }
  w.flowDirty = true;
  say(w, 'Settle the region next door, then hold it. Watch your net income.', 4);
  return w;
}

