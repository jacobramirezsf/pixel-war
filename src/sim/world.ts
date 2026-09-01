// World state container: reset, small helpers, and lossless snapshot and restore.

import { DIFF, type DiffDef, type DiffKey } from '../data/difficulty.ts';
import type { UnitKey } from '../data/units.ts';
import type { RaceKey } from '../data/races.ts';
import type { BldKey, BldKind } from '../data/buildings.ts';
import { TILE, type MapDef, type TilePos } from './map.ts';
import { makeRng, type Rng } from './rng.ts';
import type { Building, Cheats, Command, Fx, GameEvent, Mode, Work, Zone, Order, Outcome, Pending, Phase, QueueItem, Region, Rules, SandSnap, Settlement, Slot, Strike, Target, Tech, Unit, World, WorldConfig } from './types.ts';

export const BASE_HP = 400;

/** Explored map as a run-length string: pairs of run lengths, unseen first. */
export function packSeen(a: Uint8Array): string {
  const runs: number[] = [];
  let cur = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] ? 1 : 0;
    if (v === cur) n++; else { runs.push(n); cur = v; n = 1; }
  }
  runs.push(n);
  return a.length + ':' + runs.join(',');
}

export function unpackSeen(s: string): Uint8Array {
  const [len, body] = s.split(':');
  const out = new Uint8Array(+len);
  let i = 0, v = 0;
  for (const r of body.split(',')) { const n = +r; if (v) out.fill(1, i, i + n); i += n; v ^= 1; }
  return out;
}

export function defaultCheats(): Cheats {
  return { on: false, gold: false, resources: false, instant: false, build: false, powers: false, reveal: false, noPop: false, god: false, oneHit: false, superUnits: false, fastEcon: false, growth: false, allAges: false, freeBuild: false, freeUnits: false, territory: false };
}

/** Is a cheat live for this slot? Cheats belong to the player and need the master switch. */
export function cheat(w: World, slot: number, k: Exclude<keyof Cheats, 'on'>): boolean {
  return slot === 0 && w.cheats.on && w.cheats[k];
}

/** Zones of a kind that cover a point for a side. */
export function inZone(w: World, team: number, kind: Zone['kind'], x: number, y: number): boolean {
  for (const z of w.zones) if (z.kind === kind && z.t > 0 && z.team === team && Math.hypot(z.x - x, z.y - y) <= z.r) return true;
  return false;
}

export function emptyTown(): import('./types.ts').TownStats {
  return { residents: 0, housing: 0, jobs: 0, employed: 0, income: 0, state: 'stable', safeT: 999, growT: 0, peak: 0 };
}
export const ARMY_CAP = 40;
/** Fixed simulation timestep in seconds. */
export const DT = 1 / 60;
export const TICKS_PER_SEC = 60;

export function reset(map: MapDef, cfg?: Partial<WorldConfig>): World {
  const allies = cfg?.allies ?? [0, 1];
  const diff: DiffKey = cfg?.diff ?? 'std';
  const nP = allies.length;
  let nextId = 1;
  const slots: Slot[] = allies.map((ally, i) => {
    const b = map.bases[i];
    const base: Settlement = { ent: 'base', id: nextId++, team: i, x: b.tx * TILE + 4, y: b.ty * TILE + 4, hp: BASE_HP, max: BASE_HP, cd: 0, tier: 'village', region: -1, buildT: 0, hitBy: -1, nT: 0, civ: emptyTown() };
    const ai = cfg?.ai ? !!cfg.ai[i] : i !== 0;
    const race: RaceKey = cfg?.races?.[i] ?? 'kingdom';
    return { ally, race, diff: cfg?.diffs?.[i] ?? diff, alive: true, gold: i === 0 ? 60 : 40, settlements: [base], ai, aiT: 1.5, aiWant: null, aiLast: 0, queue: [], rally: null, prefer: {}, mat: 0, neutral: false, attitude: allies.map(() => 0), truce: allies.map(() => false), truceT: allies.map(() => 0), pact: allies.map(() => false), raidT: 0, powerCd: {}, age: 0, tech: { melee: 0, ranged: 0, armor: 0 } };
  });
  return {
    map,
    mode: 'skirmish',
    seed: cfg?.seed ?? 1,
    phase: 'play',
    nP,
    slots,
    diff,
    cap: ARMY_CAP,
    tick: 0,
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
    home: null,
    flowDirty: true,
    flowTick: -100,
    grid: null,
    auras: null,
    wave: DIFF[diff].wave + 2,
    waveN: 0,
    nextId,
    rng: makeRng(cfg?.seed ?? 1),
    msg: '',
    msgT: 0,
    snap: null,
    queue: [],
    log: [],
    fxRng: makeRng((cfg?.seed ?? 1) ^ 0x5f3759df),
    regions: [],
    regionOf: null,
    rules: { town: true, ages: false, civilians: false, fog: false, upkeep: false, connection: false, garrison: false, unrest: false, materials: false, population: false, diplomacy: false, veterancy: false },
    net: Array.from({ length: nP }, () => 0),
    broke: Array.from({ length: nP }, () => 0),
    capitals: Array.from({ length: nP }, () => -1),
    events: [],
    neutral: -1,
    mapDirty: false,
    strikes: [],
    instant: !!cfg?.instant,
    cheats: Object.assign(defaultCheats(), cfg?.cheats ?? {}),
    zones: [],
    works: [],
    seen: null,
    history: [],
    feats: [],
    eventT: 180,
    pending: null,
    day: 0,
  };
}

/** Queue a command for its tick. Commands stamped in the past apply on the next step. */
export function enqueue(w: World, c: Command): void {
  w.queue.push(c);
}

export const mapW = (w: World): number => w.map.cols * TILE;
export const mapH = (w: World): number => w.map.rows * TILE;
export const diffDef = (w: World): DiffDef => DIFF[w.diff];
export const slotDiff = (w: World, slot: number): DiffDef => DIFF[w.slots[slot].diff];

/** Same alliance, or under truce. Truced factions neither target nor block each other. */
export function allied(w: World, a: number, b: number): boolean {
  const A = w.slots[a], B = w.slots[b];
  return A.ally === B.ally || !!A.truce[b] || !!A.pact[b];
}

/** Sworn allies: same side, or a pact. Truce alone is only peace. */
export function sworn(w: World, a: number, b: number): boolean {
  const A = w.slots[a], B = w.slots[b];
  return A.ally === B.ally || !!A.pact[b];
}

/** One line in the realm's story. Kept short and bounded. */
export function chronicle(w: World, text: string): void {
  if (w.mode !== 'conquest') return;
  w.history.push({ day: w.day, text });
  if (w.history.length > 40) w.history.shift();
}

export function pushEvent(w: World, kind: import('./types.ts').GameEvent['kind'], text: string, x: number, y: number, region = -1): void {
  w.events.push({ tick: w.tick, kind, text, x, y, region });
  if (w.events.length > 60) w.events.shift();
}

export function say(w: World, t: string, d = 2): void {
  w.msg = t;
  w.msgT = d;
}

/** The settlement units spawn from and workers return to: the capital while it stands, else the first living one. */
export function primaryBase(w: World, team: number): Settlement {
  const list = w.slots[team].settlements;
  return list.find((b) => b.hp > 0) ?? list[0];
}

export function hasLivingSettlement(w: World, team: number): boolean {
  return w.slots[team].settlements.some((s) => s.hp > 0);
}

export function count(w: World, team: number): number {
  let n = 0;
  for (const u of w.units) if (u.team === team) n++;
  return n;
}

// ---------- snapshot and restore ----------

type SnapRef = { kind: 'unit' | 'bld' | 'base'; id: number };
type SnapOrder = { type: 'move'; x: number; y: number } | { type: 'attack'; tgt: SnapRef | null; x?: number; y?: number } | { type: 'guard'; x: number; y: number; tgt?: SnapRef | null; hold?: boolean } | { type: 'retreat' };

interface SnapUnit {
  id: number; team: number; type: UnitKey; x: number; y: number; hp: number; cd: number;
  order: SnapOrder | null; flash: number; walk: number; moving: boolean; held: boolean;
  blk: number | null; px: number; py: number; ox: number; oy: number;
  slowT: number; rootT: number; reveal: number; run: number; blinkT: number; dropT: number; kills: number; hasteT: number;
  home: number; job: number; civT: number; fleeT: number;
}

interface SnapBld {
  id: number; team: number; type: BldKey; kind: BldKind; tx: number; ty: number; x: number; y: number;
  hp: number; max: number; cd: number; dir: 'h' | 'v' | null; locked: boolean | null; tiles: [number, number][];
  buildT: number; queue: QueueItem[]; rally: { x: number; y: number } | null;
}

interface SnapSlot {
  ally: number; race: RaceKey; diff: DiffKey; alive: boolean; gold: number; settlements: Settlement[]; ai: boolean; aiT: number; aiWant: UnitKey | null; aiLast: number;
  queue: QueueItem[]; rally: { x: number; y: number } | null; prefer?: Partial<Record<string, number>>;
  mat: number; neutral: boolean; attitude: number[]; truce: boolean[]; truceT: number[]; pact?: boolean[]; raidT?: number; powerCd: Partial<Record<string, number>>;
  age: number; tech: Record<Tech, number>;
}

export interface Snapshot {
  v: 1;
  map: { name: string; cols: number; rows: number; tiles: number[]; bases: TilePos[]; mines: TilePos[] };
  mode: Mode; seed?: number; phase: Phase; nP: number; slots: SnapSlot[]; diff: DiffKey; cap: number;
  tick: number; t: number; income: number; incFlash: number;
  units: SnapUnit[]; blds: SnapBld[]; fx: Fx[]; score: number[]; barbT: number; over: Outcome;
  mines: { x: number; y: number; owner: number; prev: number }[];
  flow: (number[] | null)[] | null; home: (number[] | null)[] | null; flowDirty: boolean; flowTick: number;
  wave: number; waveN: number; nextId: number; rng: Rng; msg: string; msgT: number; snap: SandSnap | null;
  queue: Command[]; log: Command[]; fxRng: Rng;
  regions: Region[]; regionOf: number[] | null; rules: Rules; net: number[]; broke: number[]; capitals: number[];
  events: GameEvent[]; neutral: number; strikes: Strike[]; instant: boolean; cheats: Cheats;
  zones?: Zone[]; works?: Work[]; seen?: string; history?: { day: number; text: string }[]; feats: import('../data/realm.ts').FeatKey[]; eventT: number; pending: Pending | null; day: number;
}

const copyCmd = (c: Command): Command => JSON.parse(JSON.stringify(c)) as Command;

function ref(t: Target): SnapRef {
  return { kind: t.ent, id: t.id };
}

function snapOrder(o: Order | null): SnapOrder | null {
  if (!o) return null;
  if (o.type === 'move') return { type: 'move', x: o.x, y: o.y };
  if (o.type === 'guard') { const g: SnapOrder = { type: 'guard', x: o.x, y: o.y }; if (o.tgt) g.tgt = ref(o.tgt); if (o.hold) g.hold = true; return g; }
  if (o.type === 'retreat') return { type: 'retreat' };
  const a: SnapOrder = { type: 'attack', tgt: o.tgt ? ref(o.tgt) : null };
  if (o.x !== undefined) { a.x = o.x; a.y = o.y; }
  return a;
}

/** Plain-data copy of the whole world. Safe to keep, serialize, or restore from. */
export function snapshot(w: World): Snapshot {
  return {
    v: 1,
    map: {
      name: w.map.name, cols: w.map.cols, rows: w.map.rows, tiles: Array.from(w.map.tiles),
      bases: w.map.bases.map((b) => ({ tx: b.tx, ty: b.ty })), mines: w.map.mines.map((q) => ({ tx: q.tx, ty: q.ty })),
    },
    mode: w.mode, seed: w.seed, phase: w.phase, nP: w.nP,
    slots: w.slots.map((s) => ({ ally: s.ally, race: s.race, diff: s.diff, alive: s.alive, gold: s.gold, settlements: s.settlements.map((b) => ({ ...b, civ: { ...b.civ } })), ai: s.ai, aiT: s.aiT, aiWant: s.aiWant, aiLast: s.aiLast, queue: s.queue.map((q) => ({ ...q })), rally: s.rally ? { ...s.rally } : null, prefer: { ...s.prefer }, mat: s.mat, neutral: s.neutral, attitude: s.attitude.slice(), truce: s.truce.slice(), truceT: s.truceT.slice(), pact: s.pact.slice(), raidT: s.raidT, powerCd: { ...s.powerCd }, age: s.age, tech: { ...s.tech } })),
    diff: w.diff, cap: w.cap, tick: w.tick, t: w.t, income: w.income, incFlash: w.incFlash,
    units: w.units.map((u) => ({
      id: u.id, team: u.team, type: u.type, x: u.x, y: u.y, hp: u.hp, cd: u.cd, order: snapOrder(u.order),
      flash: u.flash, walk: u.walk, moving: u.moving, held: u.held, blk: u.blk ? u.blk.id : null, px: u.px, py: u.py, ox: u.ox, oy: u.oy,
      slowT: u.slowT, rootT: u.rootT, reveal: u.reveal, run: u.run, blinkT: u.blinkT, dropT: u.dropT, kills: u.kills, hasteT: u.hasteT,
      home: u.home, job: u.job, civT: u.civT, fleeT: u.fleeT,
    })),
    blds: w.blds.map((b) => ({
      id: b.id, team: b.team, type: b.type, kind: b.kind, tx: b.tx, ty: b.ty, x: b.x, y: b.y, hp: b.hp, max: b.max, cd: b.cd,
      dir: b.dir, locked: b.locked, tiles: b.tiles.map((q) => [q[0], q[1]] as [number, number]),
      buildT: b.buildT, queue: b.queue.map((q) => ({ ...q })), rally: b.rally ? { ...b.rally } : null,
    })),
    fx: w.fx.map((f) => ({ ...f })),
    score: w.score.slice(), barbT: w.barbT, over: w.over,
    mines: w.mines.map((m) => ({ ...m })),
    flow: w.flow ? w.flow.map((f) => (f ? Array.from(f) : null)) : null,
    home: w.home ? w.home.map((f) => (f ? Array.from(f) : null)) : null,
    flowDirty: w.flowDirty, flowTick: w.flowTick, wave: w.wave, waveN: w.waveN, nextId: w.nextId, rng: { s: w.rng.s }, msg: w.msg, msgT: w.msgT,
    snap: w.snap ? { units: w.snap.units.map((u) => ({ ...u })), blds: w.snap.blds.map((b) => ({ ...b })) } : null,
    queue: w.queue.map(copyCmd), log: w.log.map(copyCmd), fxRng: { s: w.fxRng.s },
    regions: w.regions.map((r) => ({ ...r, adj: r.adj.slice() })), regionOf: w.regionOf ? Array.from(w.regionOf) : null,
    rules: { ...w.rules }, net: w.net.slice(), broke: w.broke.slice(), capitals: w.capitals.slice(),
    events: w.events.map((e) => ({ ...e })), neutral: w.neutral, strikes: w.strikes.map((k) => ({ ...k })), instant: w.instant,
    cheats: { ...w.cheats },
    zones: w.zones.map((z) => ({ ...z })), works: w.works.map((k) => ({ ...k })), ...(w.seen ? { seen: packSeen(w.seen) } : {}), history: w.history.map((h) => ({ ...h })), feats: w.feats.slice(), eventT: w.eventT, pending: w.pending ? { ...w.pending } : null, day: w.day,
  };
}

/** Rebuild a live world from a snapshot. The snapshot is not modified. */
export function restore(s: Snapshot): World {
  const map: MapDef = {
    name: s.map.name, cols: s.map.cols, rows: s.map.rows, tiles: Uint8Array.from(s.map.tiles),
    bases: s.map.bases.map((b) => ({ tx: b.tx, ty: b.ty })), mines: s.map.mines.map((q) => ({ tx: q.tx, ty: q.ty })),
  };
  const slots: Slot[] = s.slots.map((x) => ({ ally: x.ally, race: x.race, diff: x.diff, alive: x.alive, gold: x.gold, settlements: x.settlements.map((b) => ({ ...b, civ: Object.assign(emptyTown(), b.civ ?? {}) })), ai: x.ai, aiT: x.aiT, aiWant: x.aiWant, aiLast: x.aiLast ?? 0, queue: (x.queue ?? []).map((q) => ({ ...q })), rally: x.rally ? { ...x.rally } : null, prefer: { ...(x.prefer ?? {}) }, mat: x.mat ?? 0, neutral: !!x.neutral, attitude: (x.attitude ?? s.slots.map(() => 0)).slice(), truce: (x.truce ?? s.slots.map(() => false)).slice(), truceT: (x.truceT ?? s.slots.map(() => 0)).slice(), pact: (x.pact ?? s.slots.map(() => false)).slice(), raidT: x.raidT ?? 0, powerCd: { ...(x.powerCd ?? {}) }, age: x.age ?? 0, tech: Object.assign({ melee: 0, ranged: 0, armor: 0 }, x.tech ?? {}) }));
  const blds: Building[] = s.blds.map((b) => ({ ent: 'bld', ...b, tiles: b.tiles.map((q) => [q[0], q[1]] as [number, number]), buildT: b.buildT ?? 0, queue: (b.queue ?? []).map((q) => ({ ...q })), rally: b.rally ? { ...b.rally } : null }));
  const bmap = new Map<number, Building>();
  for (const b of blds) for (const q of b.tiles) bmap.set(q[1] * map.cols + q[0], b);
  const bases = new Map<number, Settlement>();
  for (const sl of slots) for (const b of sl.settlements) bases.set(b.id, b);
  const bldById = new Map<number, Building>();
  for (const b of blds) bldById.set(b.id, b);
  const units: Unit[] = s.units.map((u) => ({
    ent: 'unit', id: u.id, team: u.team, type: u.type, x: u.x, y: u.y, hp: u.hp, cd: u.cd, order: null,
    flash: u.flash, walk: u.walk, moving: u.moving, held: u.held, blk: u.blk != null ? bldById.get(u.blk) ?? null : null, px: u.px, py: u.py, ox: u.ox, oy: u.oy,
    slowT: u.slowT, rootT: u.rootT, reveal: u.reveal, run: u.run, blinkT: u.blinkT, dropT: u.dropT, ix: 0, kills: u.kills ?? 0, hasteT: u.hasteT ?? 0,
    home: u.home ?? -1, job: u.job ?? -1, civT: u.civT ?? 0, fleeT: u.fleeT ?? 0,
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
    if (o.type === 'move') units[i].order = { type: 'move', x: o.x, y: o.y };
    else if (o.type === 'guard') { const g: Order = { type: 'guard', x: o.x, y: o.y }; if (o.tgt) g.tgt = resolve(o.tgt); if (o.hold) g.hold = true; units[i].order = g; }
    else if (o.type === 'retreat') units[i].order = { type: 'retreat' };
    else { const a: Order = { type: 'attack', tgt: resolve(o.tgt) }; if (o.x !== undefined) { a.x = o.x; a.y = o.y; } units[i].order = a; }
  });
  return {
    map, mode: s.mode, seed: s.seed ?? 1, phase: s.phase, nP: s.nP, slots, diff: s.diff, cap: s.cap,
    tick: s.tick, t: s.t, income: s.income, incFlash: s.incFlash, units, blds, bmap,
    fx: s.fx.map((f) => ({ ...f })), score: s.score.slice(), barbT: s.barbT, over: s.over,
    mines: s.mines.map((m) => ({ ...m })),
    flow: s.flow ? s.flow.map((f) => (f ? Float32Array.from(f) : null)) : null,
    home: s.home ? s.home.map((f) => (f ? Float32Array.from(f) : null)) : null,
    flowDirty: s.flowDirty, flowTick: s.flowTick, grid: null, auras: null, wave: s.wave, waveN: s.waveN, nextId: s.nextId, rng: { s: s.rng.s }, msg: s.msg, msgT: s.msgT,
    snap: s.snap ? { units: s.snap.units.map((u) => ({ ...u })), blds: s.snap.blds.map((b) => ({ ...b })) } : null,
    queue: s.queue.map(copyCmd), log: s.log.map(copyCmd), fxRng: { s: s.fxRng.s },
    regions: (s.regions ?? []).map((r) => ({ ...r, adj: r.adj.slice() })), regionOf: s.regionOf ? Uint8Array.from(s.regionOf) : null,
    rules: Object.assign({ town: false, ages: false, civilians: false, fog: false, upkeep: false, connection: false, garrison: false, unrest: false, materials: false, population: false, diplomacy: false, veterancy: false }, s.rules ?? {}),
    net: (s.net ?? slots.map(() => 0)).slice(), broke: (s.broke ?? slots.map(() => 0)).slice(), capitals: (s.capitals ?? slots.map(() => -1)).slice(),
    events: (s.events ?? []).map((e) => ({ ...e })), neutral: s.neutral ?? -1, mapDirty: false, strikes: (s.strikes ?? []).map((k) => ({ ...k })), instant: !!s.instant,
    cheats: Object.assign(defaultCheats(), s.cheats ?? {}),
    zones: (s.zones ?? []).map((z) => ({ ...z })), works: (s.works ?? []).map((k) => ({ ...k })), seen: s.seen ? unpackSeen(s.seen) : null, history: (s.history ?? []).map((h) => ({ ...h })), feats: (s.feats ?? []).slice(), eventT: s.eventT ?? 180, pending: s.pending ? { ...s.pending } : null, day: s.day ?? 0,
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

/** Stable string of the whole state, for equality checks in tests. */
export function stateString(w: World): string {
  return serialize(snapshot(w));
}

/** FNV-1a 64-bit hash of the state string, as 16 hex digits. */
export function stateHash(w: World): string {
  const s = stateString(w);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
