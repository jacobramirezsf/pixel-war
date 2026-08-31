// World state container: reset, small helpers, and lossless snapshot and restore.

import { DIFF, type DiffDef, type DiffKey } from '../data/difficulty.ts';
import type { UnitKey } from '../data/units.ts';
import type { BldKey, BldKind } from '../data/buildings.ts';
import { TILE, type MapDef, type TilePos } from './map.ts';
import { makeRng, type Rng } from './rng.ts';
import type { Building, Fx, Mode, Order, Outcome, Phase, SandSnap, Settlement, Slot, Target, Unit, World, WorldConfig } from './types.ts';

export const BASE_HP = 400;
export const ARMY_CAP = 40;

export function reset(map: MapDef, cfg?: Partial<WorldConfig>): World {
  const allies = cfg?.allies ?? [0, 1];
  const diff: DiffKey = cfg?.diff ?? 'std';
  const nP = allies.length;
  let nextId = 1;
  const slots: Slot[] = allies.map((ally, i) => {
    const b = map.bases[i];
    const base: Settlement = { ent: 'base', id: nextId++, team: i, x: b.tx * TILE + 4, y: b.ty * TILE + 4, hp: BASE_HP, max: BASE_HP, cd: 0 };
    return { ally, alive: true, gold: i === 0 ? 60 : 40, settlements: [base], aiT: 1.5, aiWant: null };
  });
  return {
    map,
    mode: 'skirmish',
    phase: 'play',
    nP,
    slots,
    diff,
    cap: ARMY_CAP,
    paused: false,
    t: 0,
    income: 2,
    incFlash: 0,
    units: [],
    blds: [],
    bmap: new Map(),
    fx: [],
    score: [0, 0],
    barbT: 0,
    over: null,
    mines: map.mines.map((q) => ({ x: q.tx * TILE + 4, y: q.ty * TILE + 4, owner: -1, prev: -1 })),
    flow: null,
    flowDirty: true,
    wave: DIFF[diff].wave + 2,
    waveN: 0,
    nextId,
    rng: makeRng(cfg?.seed ?? 1),
    msg: '',
    msgT: 0,
    snap: null,
  };
}

export const mapW = (w: World): number => w.map.cols * TILE;
export const mapH = (w: World): number => w.map.rows * TILE;
export const diffDef = (w: World): DiffDef => DIFF[w.diff];

export function allied(w: World, a: number, b: number): boolean {
  return w.slots[a].ally === w.slots[b].ally;
}

export function say(w: World, t: string, d = 2): void {
  w.msg = t;
  w.msgT = d;
}

/** The settlement units spawn from and workers return to. Skirmish has exactly one. */
export function primaryBase(w: World, team: number): Settlement {
  return w.slots[team].settlements[0];
}

export function hasLivingSettlement(w: World, team: number): boolean {
  return w.slots[team].settlements.some((s) => s.hp > 0);
}

export function count(w: World, team: number): number {
  let n = 0;
  for (const u of w.units) if (u.team === team) n++;
  return n;
}

export function selected(w: World): Unit[] {
  return w.units.filter((u) => u.sel);
}

// ---------- snapshot and restore ----------

type SnapRef = { kind: 'unit' | 'bld' | 'base'; id: number };
type SnapOrder = { type: 'move'; x: number; y: number } | { type: 'attack'; tgt: SnapRef | null };

interface SnapUnit {
  id: number; team: number; type: UnitKey; x: number; y: number; hp: number; cd: number;
  order: SnapOrder | null; sel: boolean; flash: number; walk: number; moving: boolean; held: boolean;
  blk: number | null; px: number; py: number;
}

interface SnapBld {
  id: number; team: number; type: BldKey; kind: BldKind; tx: number; ty: number; x: number; y: number;
  hp: number; max: number; cd: number; dir: 'h' | 'v' | null; locked: boolean | null; tiles: [number, number][];
}

interface SnapSlot {
  ally: number; alive: boolean; gold: number; settlements: Settlement[]; aiT: number; aiWant: UnitKey | null;
}

export interface Snapshot {
  v: 1;
  map: { name: string; cols: number; rows: number; tiles: number[]; bases: TilePos[]; mines: TilePos[] };
  mode: Mode; phase: Phase; nP: number; slots: SnapSlot[]; diff: DiffKey; cap: number; paused: boolean;
  t: number; income: number; incFlash: number;
  units: SnapUnit[]; blds: SnapBld[]; fx: Fx[]; score: number[]; barbT: number; over: Outcome;
  mines: { x: number; y: number; owner: number; prev: number }[];
  flow: (number[] | null)[] | null; flowDirty: boolean;
  wave: number; waveN: number; nextId: number; rng: Rng; msg: string; msgT: number; snap: SandSnap | null;
}

function ref(t: Target): SnapRef {
  return { kind: t.ent, id: t.id };
}

function snapOrder(o: Order | null): SnapOrder | null {
  if (!o) return null;
  if (o.type === 'move') return { type: 'move', x: o.x, y: o.y };
  return { type: 'attack', tgt: o.tgt ? ref(o.tgt) : null };
}

/** Plain-data copy of the whole world. Safe to keep, serialize, or restore from. */
export function snapshot(w: World): Snapshot {
  return {
    v: 1,
    map: {
      name: w.map.name, cols: w.map.cols, rows: w.map.rows, tiles: Array.from(w.map.tiles),
      bases: w.map.bases.map((b) => ({ tx: b.tx, ty: b.ty })), mines: w.map.mines.map((q) => ({ tx: q.tx, ty: q.ty })),
    },
    mode: w.mode, phase: w.phase, nP: w.nP,
    slots: w.slots.map((s) => ({ ally: s.ally, alive: s.alive, gold: s.gold, settlements: s.settlements.map((b) => ({ ...b })), aiT: s.aiT, aiWant: s.aiWant })),
    diff: w.diff, cap: w.cap, paused: w.paused, t: w.t, income: w.income, incFlash: w.incFlash,
    units: w.units.map((u) => ({
      id: u.id, team: u.team, type: u.type, x: u.x, y: u.y, hp: u.hp, cd: u.cd, order: snapOrder(u.order), sel: u.sel,
      flash: u.flash, walk: u.walk, moving: u.moving, held: u.held, blk: u.blk ? u.blk.id : null, px: u.px, py: u.py,
    })),
    blds: w.blds.map((b) => ({
      id: b.id, team: b.team, type: b.type, kind: b.kind, tx: b.tx, ty: b.ty, x: b.x, y: b.y, hp: b.hp, max: b.max, cd: b.cd,
      dir: b.dir, locked: b.locked, tiles: b.tiles.map((q) => [q[0], q[1]] as [number, number]),
    })),
    fx: w.fx.map((f) => ({ ...f })),
    score: w.score.slice(), barbT: w.barbT, over: w.over,
    mines: w.mines.map((m) => ({ ...m })),
    flow: w.flow ? w.flow.map((f) => (f ? Array.from(f) : null)) : null,
    flowDirty: w.flowDirty, wave: w.wave, waveN: w.waveN, nextId: w.nextId, rng: { s: w.rng.s }, msg: w.msg, msgT: w.msgT,
    snap: w.snap ? { units: w.snap.units.map((u) => ({ ...u })), blds: w.snap.blds.map((b) => ({ ...b })) } : null,
  };
}

/** Rebuild a live world from a snapshot. The snapshot is not modified. */
export function restore(s: Snapshot): World {
  const map: MapDef = {
    name: s.map.name, cols: s.map.cols, rows: s.map.rows, tiles: Uint8Array.from(s.map.tiles),
    bases: s.map.bases.map((b) => ({ tx: b.tx, ty: b.ty })), mines: s.map.mines.map((q) => ({ tx: q.tx, ty: q.ty })),
  };
  const slots: Slot[] = s.slots.map((x) => ({ ally: x.ally, alive: x.alive, gold: x.gold, settlements: x.settlements.map((b) => ({ ...b })), aiT: x.aiT, aiWant: x.aiWant }));
  const blds: Building[] = s.blds.map((b) => ({ ent: 'bld', ...b, tiles: b.tiles.map((q) => [q[0], q[1]] as [number, number]) }));
  const bmap = new Map<number, Building>();
  for (const b of blds) for (const q of b.tiles) bmap.set(q[1] * map.cols + q[0], b);
  const bases = new Map<number, Settlement>();
  for (const sl of slots) for (const b of sl.settlements) bases.set(b.id, b);
  const bldById = new Map<number, Building>();
  for (const b of blds) bldById.set(b.id, b);
  const units: Unit[] = s.units.map((u) => ({
    ent: 'unit', id: u.id, team: u.team, type: u.type, x: u.x, y: u.y, hp: u.hp, cd: u.cd, order: null, sel: u.sel,
    flash: u.flash, walk: u.walk, moving: u.moving, held: u.held, blk: u.blk != null ? bldById.get(u.blk) ?? null : null, px: u.px, py: u.py,
  }));
  const unitById = new Map<number, Unit>();
  for (const u of units) unitById.set(u.id, u);
  const resolve = (r: SnapRef | null): Target | null => {
    if (!r) return null;
    if (r.kind === 'unit') return unitById.get(r.id) ?? null;
    if (r.kind === 'bld') return bldById.get(r.id) ?? null;
    return bases.get(r.id) ?? null;
  };
  s.units.forEach((su, i) => {
    const o = su.order;
    if (!o) return;
    units[i].order = o.type === 'move' ? { type: 'move', x: o.x, y: o.y } : { type: 'attack', tgt: resolve(o.tgt) };
  });
  return {
    map, mode: s.mode, phase: s.phase, nP: s.nP, slots, diff: s.diff, cap: s.cap, paused: s.paused,
    t: s.t, income: s.income, incFlash: s.incFlash, units, blds, bmap,
    fx: s.fx.map((f) => ({ ...f })), score: s.score.slice(), barbT: s.barbT, over: s.over,
    mines: s.mines.map((m) => ({ ...m })),
    flow: s.flow ? s.flow.map((f) => (f ? Float32Array.from(f) : null)) : null,
    flowDirty: s.flowDirty, wave: s.wave, waveN: s.waveN, nextId: s.nextId, rng: { s: s.rng.s }, msg: s.msg, msgT: s.msgT,
    snap: s.snap ? { units: s.snap.units.map((u) => ({ ...u })), blds: s.snap.blds.map((b) => ({ ...b })) } : null,
  };
}

// JSON cannot carry Infinity. Unlimited Gold uses it for the treasury and flow fields use it for walls.
function replacer(_k: string, v: unknown): unknown {
  if (typeof v === 'number' && !Number.isFinite(v)) return { $num: v > 0 ? 'Infinity' : '-Infinity' };
  return v;
}

function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object' && '$num' in v) return (v as { $num: string }).$num === 'Infinity' ? Infinity : -Infinity;
  return v;
}

export function serialize(s: Snapshot): string {
  return JSON.stringify(s, replacer);
}

export function deserialize(text: string): Snapshot {
  return JSON.parse(text, reviver) as Snapshot;
}

/** Stable string of the whole state, for equality checks in tests and the balance harness. */
export function stateHash(w: World): string {
  return serialize(snapshot(w));
}
