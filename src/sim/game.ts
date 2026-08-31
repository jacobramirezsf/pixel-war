// Starting a game in any mode.

import type { DiffKey } from '../data/difficulty.ts';
import type { RaceKey } from '../data/races.ts';
import { buildFort } from './buildings.ts';
import { makeRegions, mkNeutralSlot, populateWorld, regionAt, TIERS } from './conquest.ts';
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
  /** Conquest: number of rival factions, 1 to 4. */
  rivals?: number;
  /** Conquest: which rules are on. The slice turns unrest and the later systems off. */
  rules?: Partial<import('./types.ts').Rules>;
  /** Units finish the moment they are bought. */
  instant?: boolean;
  cheats?: Partial<import('./types.ts').Cheats>;
}

/** Copy of the chosen map, with extra bases placed for 3 to 5 players. */
export function prepareMap(map: MapDef, nP: number): MapDef {
  const m = cloneMap(map, map.name);
  return nP > 2 ? mkBases(m, nP) : m;
}

/** Conquest worlds: 40x40 with nine regions for one rival, larger grids for more. */
export function conquestMap(seed: number, rivals = 1): { map: MapDef; grid: number } {
  const grid = rivals <= 1 ? 3 : rivals === 2 ? 4 : 5;
  // Sixteen tiles a region leaves room for a town.
  const size = grid * 16;
  const mines: [number, number][] = [];
  for (let g = 0; g < grid; g++) { const c = Math.round((g + 0.5) * (size / grid)); mines.push([c, 5], [c, size - 6], [5, c], [size - 6, c]); }
  const uniq = mines.filter((m, i) => mines.findIndex((q) => q[0] === m[0] && q[1] === m[1]) === i).slice(0, 6);
  const m = gen({ name: 'Conquest', cols: size, rows: size, seed, road: false, tree: 0.45, rock: 0.35, water: 0.3, mines: uniq });
  const corners: { tx: number; ty: number }[] = [{ tx: 5, ty: size - 6 }, { tx: size - 6, ty: 5 }, { tx: 5, ty: 5 }, { tx: size - 6, ty: size - 6 }, { tx: size >> 1, ty: 4 }];
  m.bases = corners.slice(0, rivals + 1);
  return { map: finishMap(m), grid };
}

export function newGame(map: MapDef, mode: Mode, cfg?: GameConfig): World {
  if (mode === 'conquest') return newConquest(cfg);
  const allies = cfg?.allies ?? [0, 1];
  const w = reset(prepareMap(map, allies.length), { allies, diff: cfg?.diff ?? 'std', seed: cfg?.seed, ai: cfg?.ai, races: cfg?.races, diffs: cfg?.diffs, instant: cfg?.instant, cheats: cfg?.cheats });
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
  const rivals = Math.max(1, Math.min(4, cfg?.rivals ?? 1));
  const { map, grid } = conquestMap(seed, rivals);
  const allies = Array.from({ length: rivals + 1 }, (_, i) => i);
  const races = allies.map((i) => cfg?.races?.[i] ?? 'kingdom');
  const w = reset(map, { allies, diff: cfg?.diff ?? 'std', seed, ai: allies.map((i) => i !== 0), races, diffs: cfg?.diffs, instant: cfg?.instant, cheats: cfg?.cheats });
  w.mode = 'conquest';
  w.cap = 80;
  w.rules = { town: true, upkeep: true, connection: true, garrison: true, unrest: true, materials: true, population: true, diplomacy: true, veterancy: true, ...(cfg?.rules ?? {}) };
  const rng = makeRng(seed ^ 0x9e3779b9);
  const { regions, regionOf } = makeRegions(map, rng, grid);
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
    w.slots[i].mat = 60;
  }
  // The neutral faction: bandits, independents, ruins, and later rebels.
  const neutral = mkNeutralSlot(w);
  neutral.powerCd = {};
  w.slots.push(neutral);
  w.nP = w.slots.length;
  w.neutral = w.nP - 1;
  for (const s of w.slots) { s.attitude.push(-100); s.truce.push(false); s.truceT.push(0); }
  w.net.push(0); w.broke.push(0); w.capitals.push(-1);
  w.score = w.slots.map(() => 0);
  populateWorld(w, rng);
  w.flowDirty = true;
  say(w, 'Settle the region next door, then hold it. Watch your net income.', 4);
  return w;
}

