// Simulation state types. Everything here is plain data plus object references
// between live entities. Snapshots convert those references to ids.

import type { UnitKey } from '../data/units.ts';
import type { BldKey, BldKind } from '../data/buildings.ts';
import type { DiffKey } from '../data/difficulty.ts';
import type { RaceKey } from '../data/races.ts';
import type { MapDef } from './map.ts';
import type { Rng } from './rng.ts';

export type Mode = 'skirmish' | 'multi' | 'dom' | 'rich' | 'sand';
export type Phase = 'play' | 'edit';
export type Outcome = 'win' | 'lose' | null;

export interface Settlement {
  ent: 'base';
  id: number;
  team: number;
  x: number;
  y: number;
  hp: number;
  max: number;
  cd: number;
}

export interface Building {
  ent: 'bld';
  id: number;
  team: number;
  type: BldKey;
  kind: BldKind;
  tx: number;
  ty: number;
  x: number;
  y: number;
  hp: number;
  max: number;
  cd: number;
  /** Gates only. */
  dir: 'h' | 'v' | null;
  /** Gates only. */
  locked: boolean | null;
  tiles: [number, number][];
}

export type Target = Unit | Building | Settlement;

export type Order =
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; tgt: Target | null };

export interface Unit {
  ent: 'unit';
  id: number;
  team: number;
  type: UnitKey;
  x: number;
  y: number;
  hp: number;
  cd: number;
  order: Order | null;
  flash: number;
  walk: number;
  moving: boolean;
  /** AI units wait at the base until the next wave. */
  held: boolean;
  /** Enemy building that stopped this unit's last move. */
  blk: Building | null;
  px: number;
  py: number;
  /** Position at the start of the tick, for render interpolation. */
  ox: number;
  oy: number;
  /** Seconds of half speed left. */
  slowT: number;
  /** Seconds of no movement left. */
  rootT: number;
  /** Seconds a stealth unit stays visible. */
  reveal: number;
  /** Distance run since the last attack, for charge bonuses. */
  run: number;
  /** Cooldown left before the next blink. */
  blinkT: number;
  /** Time until the next trap drop. */
  dropT: number;
}

export interface Mine {
  x: number;
  y: number;
  owner: number;
  prev: number;
}

export interface Slot {
  /** Alliance id. Slots with the same value are allies. */
  ally: number;
  race: RaceKey;
  alive: boolean;
  gold: number;
  /** A faction owns a collection of settlements. Skirmish puts one here. */
  settlements: Settlement[];
  /** True when the built-in AI drives this slot. */
  ai: boolean;
  aiT: number;
  aiWant: UnitKey | null;
}

export type Fx =
  | { k: 'shot'; x1: number; y1: number; x2: number; y2: number; t: number; c: string }
  | { k: 'hit'; x: number; y: number; t: number }
  | { k: 'die'; x: number; y: number; t: number }
  | { k: 'ping'; x: number; y: number; t: number }
  | { k: 'boom'; x: number; y: number; r: number; t: number }
  | { k: 'heal'; x: number; y: number; t: number }
  | { k: 'fix'; x: number; y: number; t: number }
  | { k: 'txt'; x: number; y: number; t: number; str: string; c: string };

/** Sandbox army layout, restored on replay and on return to edit. */
export interface SandSnap {
  units: { team: number; type: UnitKey; x: number; y: number }[];
  blds: { team: number; type: BldKey; tx: number; ty: number; dir: 'h' | 'v' | null; locked: boolean | null }[];
}

export interface World {
  map: MapDef;
  mode: Mode;
  phase: Phase;
  nP: number;
  slots: Slot[];
  diff: DiffKey;
  cap: number;
  /** Ticks stepped so far. Commands are stamped with the tick they apply on. */
  tick: number;
  t: number;
  /** Player income, shown in the HUD. */
  income: number;
  incFlash: number;
  units: Unit[];
  blds: Building[];
  /** Tile index to building. Derived from blds, rebuilt on restore. */
  bmap: Map<number, Building>;
  fx: Fx[];
  score: number[];
  barbT: number;
  over: Outcome;
  mines: Mine[];
  /** Per-slot flow field toward hostile bases. Null entries for dead or unopposed slots. */
  flow: (Float32Array | null)[] | null;
  flowDirty: boolean;
  wave: number;
  waveN: number;
  nextId: number;
  rng: Rng;
  msg: string;
  msgT: number;
  snap: SandSnap | null;
  /** Commands waiting for their tick. */
  queue: Command[];
  /** Every external command applied so far. Seed plus log replays the game. */
  log: Command[];
  /** Cosmetic randomness. Never feeds gameplay, so effects cannot change outcomes. */
  fxRng: Rng;
}

export interface TargetRef {
  kind: 'unit' | 'bld' | 'base';
  id: number;
}

export type Action =
  | { type: 'buy'; payload: { unit: UnitKey } }
  | { type: 'move'; payload: { ids: number[]; x: number; y: number } }
  | { type: 'attack'; payload: { ids: number[]; target: TargetRef | null } }
  | { type: 'hold'; payload: { ids: number[] } }
  | { type: 'gate'; payload: { id: number } }
  | { type: 'build'; payload: { x: number; y: number; bld: BldKey } }
  | { type: 'sell'; payload: { x: number; y: number } }
  | { type: 'place'; payload: { unit: UnitKey; x: number; y: number } }
  | { type: 'erase'; payload: { x: number; y: number } }
  | { type: 'clear'; payload: null }
  | { type: 'mirror'; payload: null }
  | { type: 'startBattle'; payload: null }
  | { type: 'toEdit'; payload: null };

export type Command = Action & { tick: number; slot: number };

export interface WorldConfig {
  allies: number[];
  diff: DiffKey;
  seed?: number;
  /** Which slots the built-in AI drives. Default: every slot but 0. */
  ai?: boolean[];
  /** Race per slot. Default: kingdom. */
  races?: RaceKey[];
}
