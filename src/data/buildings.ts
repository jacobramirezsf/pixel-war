// Building definitions. The prototype's eight defenses are unchanged. The town buildings
// (houses, farms, market, blacksmith, military buildings, castle) are Conquest's build-out, in
// the spirit of Age of Empires II: each military building trains one class, houses raise the
// population cap, and the age of your settlement gates what you can build.

import type { Role } from './units.ts';

export type BldKey =
  | 'brb' | 'stk' | 'wal' | 'stw' | 'gat' | 'twr' | 'stt' | 'trt'
  | 'house' | 'farm' | 'market' | 'smith' | 'barracks' | 'range' | 'stable' | 'siege' | 'castle' | 'wonder';
export type BldKind = 'trap' | 'wall' | 'gate' | 'tower' | 'town';
export type BldGroup = 'defense' | 'economy' | 'military';

export interface BldDef {
  name: string;
  /** Gold. */
  cost: number;
  hp: number;
  kind: BldKind;
  group: BldGroup;
  /** Footprint in tiles. Gates are 2x1 or 1x2 by orientation. */
  w: number;
  h: number;
  armor?: number;
  dmg?: number;
  range?: number;
  cd?: number;
  /** Materials, charged in Conquest on top of gold. */
  mat?: number;
  /** Age needed: 0 village, 1 town, 2 city. */
  age?: number;
  /** Seconds to construct in town mode. */
  buildT?: number;
  /** Population capacity it adds. */
  pop?: number;
  /** Gold per second it adds while standing near a Town Hall. */
  income?: number;
  /** Unit roles this building trains. */
  trains?: Role[];
  /** Only in town mode. */
  town?: boolean;
  /** How many of these a faction may own. */
  max?: number;
  hint?: string;
}

export const BLD: Record<BldKey, BldDef> = {
  brb: { name: 'BARBED',     cost: 4,   hp: 40,  kind: 'trap', group: 'defense', w: 1, h: 1, age: 0, buildT: 2 },
  stk: { name: 'PALISADE',   cost: 6,   hp: 60,  kind: 'wall', group: 'defense', w: 1, h: 1, age: 0, buildT: 3 },
  wal: { name: 'STONE WALL', cost: 15,  hp: 220, kind: 'wall', group: 'defense', w: 1, h: 1, armor: 2, mat: 15, age: 1, buildT: 6 },
  stw: { name: 'STEEL WALL', cost: 30,  hp: 450, kind: 'wall', group: 'defense', w: 1, h: 1, armor: 4, mat: 30, age: 2, buildT: 10 },
  gat: { name: 'GATE',       cost: 20,  hp: 220, kind: 'gate', group: 'defense', w: 2, h: 1, armor: 2, mat: 20, age: 0, buildT: 6 },
  twr: { name: 'WOOD TWR',   cost: 40,  hp: 120, kind: 'tower', group: 'defense', w: 1, h: 1, dmg: 6,  range: 30, cd: 0.8, age: 0, buildT: 15 },
  stt: { name: 'STONE TWR',  cost: 80,  hp: 260, kind: 'tower', group: 'defense', w: 1, h: 1, dmg: 12, range: 38, cd: 0.9, armor: 2, mat: 80, age: 1, buildT: 25 },
  trt: { name: 'TURRET',     cost: 150, hp: 320, kind: 'tower', group: 'defense', w: 1, h: 1, dmg: 9,  range: 44, cd: 0.25, armor: 3, mat: 120, age: 2, buildT: 35 },
  house:    { name: 'HOUSE',       cost: 40,  hp: 150, kind: 'town', group: 'economy', w: 2, h: 2, age: 0, buildT: 15, pop: 5, town: true, max: 20, hint: 'Room for five more units.' },
  farm:     { name: 'FARM',        cost: 40,  hp: 80,  kind: 'town', group: 'economy', w: 2, h: 2, age: 0, buildT: 12, income: 0.5, town: true, max: 12, hint: 'Half a gold a second. Keep it near a Town Hall.' },
  market:   { name: 'MARKET',      cost: 80,  hp: 250, kind: 'town', group: 'economy', w: 3, h: 2, age: 1, buildT: 25, income: 1, town: true, max: 2, hint: 'A gold a second.' },
  smith:    { name: 'BLACKSMITH',  cost: 100, hp: 250, kind: 'town', group: 'economy', w: 2, h: 2, mat: 20, age: 1, buildT: 25, town: true, max: 2, hint: 'Research sharper blades, better bows, thicker armor.' },
  barracks: { name: 'BARRACKS',    cost: 80,  hp: 350, kind: 'town', group: 'military', w: 3, h: 2, age: 0, buildT: 25, trains: ['line'], town: true, max: 4, hint: 'Trains line infantry.' },
  range:    { name: 'RANGE',       cost: 100, hp: 300, kind: 'town', group: 'military', w: 3, h: 2, age: 1, buildT: 30, trains: ['ranged'], town: true, max: 3, hint: 'Trains archers and other ranged units.' },
  stable:   { name: 'STABLE',      cost: 110, hp: 320, kind: 'town', group: 'military', w: 3, h: 2, age: 1, buildT: 30, trains: ['fast', 'air'], town: true, max: 2, hint: 'Trains fast units and fliers.' },
  siege:    { name: 'SIEGE WORKS', cost: 150, hp: 320, kind: 'town', group: 'military', w: 3, h: 2, mat: 40, age: 2, buildT: 40, trains: ['siege'], town: true, max: 2, hint: 'Trains siege engines.' },
  wonder:   { name: 'WONDER',      cost: 800, hp: 1500, kind: 'town', group: 'economy', w: 4, h: 4, mat: 400, age: 2, buildT: 240, pop: 10, income: 2, town: true, max: 1, hint: 'The great work of a realm. Long to build, seen from afar, and every rival will want it gone.' },
  castle:   { name: 'CASTLE',      cost: 250, hp: 900, kind: 'tower', group: 'military', w: 3, h: 3, dmg: 14, range: 46, cd: 0.5, armor: 4, mat: 300, age: 2, buildT: 75, pop: 20, trains: ['heavy', 'special'], town: true, max: 3, hint: 'Shoots, trains heavies and specials, holds the region calm.' },
};

/** Build strip order. */
export const BORDER: readonly BldKey[] = Object.keys(BLD) as BldKey[];
export const AGE_NAMES = ['VILLAGE', 'TOWN', 'CITY'];

export function isBldKey(k: string): k is BldKey {
  return Object.prototype.hasOwnProperty.call(BLD, k);
}

/** Which building trains a role in town mode. Workers and scouts come from the Town Hall. */
export function trainerFor(role: Role): BldKey | null {
  for (const k of BORDER) if (BLD[k].trains?.includes(role)) return k;
  return null;
}

/** Cap on buildings per team. */
export const BUILD_CAP = 120;
