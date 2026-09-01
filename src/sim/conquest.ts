// Conquest: one continuous world split into regions you claim by settling and keep by holding.
// Regions, claims, connection, garrison, unrest, neutrals, materials, population, diplomacy.

import { BLD, type BldKey } from '../data/buildings.ts';
import { roster, TYPES } from '../data/units.ts';
import { canPlaceSettlement } from './buildings.ts';
import { TILE, type MapDef } from './map.ts';
import { rand, randInt, type Rng } from './rng.ts';
import type { Region, Settlement, Slot, Tier, Unit, World } from './types.ts';
import { mkUnit } from './units.ts';
import { castleNear, townIncome, townPop } from './town.ts';
import { civIncome, seedResidents } from './civ.ts';
import { PERSONAS } from '../data/personas.ts';
import { TNAME } from '../data/teams.ts';
import { NAMES } from '../data/names.ts';
import { DAY, FEAT_RULES, FEATS, GROW, type FeatKey } from '../data/realm.ts';
import { buildingsOf } from './civ.ts';
import { canPlaceSettlement as placeOk } from './buildings.ts';
import { allied, cheat, chronicle, emptyTown, pushEvent, say } from './world.ts';

const BASE_NAMES = ['Ashford', 'Brine', 'Coldwater', 'Dunmere', 'Elsmoor', 'Fallow', 'Greyholm', 'Hollin', 'Ironmark', 'Kestrel', 'Larkspur', 'Marrow', 'Northam', 'Oakhurst', 'Pale Reach', 'Quarry Hill', 'Rook', 'Saltmere', 'Thornby', 'Umber', 'Vale', 'Wendle', 'Yarrow', 'Zell', 'Ambry'];
/** 125 names: the base list, then the same lands by compass. Enough for the largest world. */
export const REGION_NAMES: readonly string[] = ['', 'North ', 'South ', 'East ', 'West '].flatMap((p) => BASE_NAMES.map((n) => p + n));

export const CLAIM_SECONDS = 30;
export const WEAK_CLAIM_SECONDS = 10;
export const PEACE_AFTER = 300;

export interface TierDef {
  gold: number;
  mat: number;
  hp: number;
  buildT: number;
  income: number;
  upkeep: number;
  /** Multiplier on the garrison requirement of this and adjacent regions. */
  garrisonMul: number;
  /** Population capacity. */
  pop: number;
  /** Materials per second. */
  matRate: number;
  /** Can queue units. */
  produces: boolean;
}

export const TIERS: Record<Tier, TierDef> = {
  outpost:  { gold: 50,  mat: 20,  hp: 120, buildT: 10, income: 0,   upkeep: 0.1, garrisonMul: 1,   pop: 2,  matRate: 0,   produces: false },
  village:  { gold: 150, mat: 50,  hp: 300, buildT: 20, income: 2,   upkeep: 0.3, garrisonMul: 1,   pop: 10, matRate: 0,   produces: true },
  town:     { gold: 250, mat: 100, hp: 500, buildT: 40, income: 3,   upkeep: 0.5, garrisonMul: 1,   pop: 15, matRate: 0.2, produces: true },
  fortress: { gold: 250, mat: 150, hp: 600, buildT: 45, income: 3,   upkeep: 0.6, garrisonMul: 0.5, pop: 20, matRate: 0.3, produces: true },
  city:     { gold: 450, mat: 300, hp: 900, buildT: 75, income: 5,   upkeep: 1.0, garrisonMul: 0.5, pop: 40, matRate: 0.5, produces: true },
  camp:     { gold: 0,   mat: 0,   hp: 200, buildT: 0,  income: 0,   upkeep: 0,   garrisonMul: 1,   pop: 0,  matRate: 0,   produces: false },
  ruin:     { gold: 0,   mat: 0,   hp: 60,  buildT: 0,  income: 0,   upkeep: 0,   garrisonMul: 1,   pop: 0,  matRate: 0,   produces: false },
};

export const NEXT_TIER: Partial<Record<Tier, Tier>> = { outpost: 'village', village: 'town', town: 'city', fortress: 'city' };
/** Age a settlement tier grants: village 0, town 1, city 2. */
export const TIER_AGE: Record<Tier, number> = { outpost: 0, village: 0, town: 1, fortress: 1, city: 2, camp: 0, ruin: 0 };

/** Advanced units need a city somewhere in the faction. */
export const ADVANCED_COST = 60;

/** Split the map into an irregular grid of regions: jittered seeds, tiles go to the nearest seed. */
export function makeRegions(m: MapDef, rng: Rng, grid = 3): { regions: Region[]; regionOf: Uint8Array } {
  const seeds: { x: number; y: number }[] = [];
  const cw = m.cols / grid, ch = m.rows / grid;
  for (let gy = 0; gy < grid; gy++)
    for (let gx = 0; gx < grid; gx++)
      seeds.push({ x: (gx + 0.5) * cw + (rand(rng) - 0.5) * cw * 0.4, y: (gy + 0.5) * ch + (rand(rng) - 0.5) * ch * 0.4 });
  const regionOf = new Uint8Array(m.cols * m.rows);
  const trees = new Array(seeds.length).fill(0), rocks = new Array(seeds.length).fill(0), sizes = new Array(seeds.length).fill(0);
  for (let ty = 0; ty < m.rows; ty++)
    for (let tx = 0; tx < m.cols; tx++) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const d = (tx + 0.5 - seeds[i].x) ** 2 + (ty + 0.5 - seeds[i].y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      regionOf[ty * m.cols + tx] = best;
      sizes[best]++;
      const t = m.tiles[ty * m.cols + tx];
      if (t === 2) trees[best]++;
      if (t === 4) rocks[best]++;
    }
  const regions: Region[] = seeds.map((sd, i) => ({
    id: i, name: REGION_NAMES[i % REGION_NAMES.length], cx: Math.round(sd.x * TILE), cy: Math.round(sd.y * TILE), adj: [],
    owner: -1, claimant: -1, claimT: 0, contested: false, connected: true, garrison: 0, need: 0, unrest: 0,
    mat: Math.round(((trees[i] + rocks[i]) / Math.max(1, sizes[i])) * 2 * 100) / 100,
  }));
  const adj = regions.map(() => new Set<number>());
  for (let ty = 0; ty < m.rows; ty++)
    for (let tx = 0; tx < m.cols; tx++) {
      const a = regionOf[ty * m.cols + tx];
      if (tx + 1 < m.cols) { const b = regionOf[ty * m.cols + tx + 1]; if (a !== b) { adj[a].add(b); adj[b].add(a); } }
      if (ty + 1 < m.rows) { const b = regionOf[(ty + 1) * m.cols + tx]; if (a !== b) { adj[a].add(b); adj[b].add(a); } }
    }
  regions.forEach((r, i) => { r.adj = [...adj[i]].sort((x, y) => x - y); });
  return { regions, regionOf };
}

export function regionAt(w: World, x: number, y: number): number {
  if (!w.regionOf) return -1;
  const tx = Math.max(0, Math.min(w.map.cols - 1, (x / TILE) | 0)), ty = Math.max(0, Math.min(w.map.rows - 1, (y / TILE) | 0));
  return w.regionOf[ty * w.map.cols + tx];
}

let sinTick = -1, sinWorld: World | null = null, sinMap: Map<number, Settlement[]> = new Map();

/** Living settlements in a region. Built once per tick and reused; the list is fresh when the tick or world changes. */
export function settlementsIn(w: World, region: number): Settlement[] {
  if (sinWorld !== w || sinTick !== w.tick) {
    sinWorld = w; sinTick = w.tick; sinMap = new Map();
    for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0) { const l = sinMap.get(b.region); if (l) l.push(b); else sinMap.set(b.region, [b]); }
  }
  return sinMap.get(region) ?? [];
}

/** Forget the per-tick cache after anything that changes settlements mid-tick. */
export function settlementsChanged(): void { sinTick = -1; }

const isNeutral = (w: World, team: number): boolean => w.slots[team].neutral;

/** Why a settlement cannot go here, or null. */
export function canSettle(w: World, slot: number, x: number, y: number): string | null {
  const r = regionAt(w, x, y);
  if (r < 0) return 'not a conquest world';
  const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
  const why = canPlaceSettlement(w, tx, ty);
  if (why) return why;
  const here = settlementsIn(w, r);
  if (here.some((b) => b.team === slot)) return 'you already hold a settlement here';
  if (here.some((b) => !allied(w, b.team, slot) && !isNeutral(w, b.team))) return 'the enemy holds this region';
  if (here.some((b) => isNeutral(w, b.team) && b.tier !== 'ruin')) return 'independents live here. Absorb or clear them';
  const reg = w.regions[r];
  if (reg.owner >= 0 && !allied(w, reg.owner, slot)) return 'enemy territory, take it first';
  const ownAdj = reg.owner === slot || reg.adj.some((a) => w.regions[a].owner === slot);
  if (!ownAdj && !cheat(w, slot, 'territory')) return 'not next to your territory';
  return null;
}

export function mkSettlement(w: World, slot: number, x: number, y: number, tier: Tier, instant: boolean): Settlement {
  const T = TIERS[tier];
  return { ent: 'base', id: w.nextId++, team: slot, x: ((x / TILE) | 0) * TILE + 4, y: ((y / TILE) | 0) * TILE + 4, hp: instant ? T.hp : Math.round(T.hp * 0.3), max: T.hp, cd: 0, tier, region: regionAt(w, x, y), buildT: instant ? 0 : T.buildT, hitBy: -1, nT: tier === 'camp' ? 150 : 0, civ: emptyTown() };
}

/** Founding clears the trees in the footprint. Water and rock are refused earlier. */
function clearFootprint(w: World, tx: number, ty: number, rx = 2, ry = 1): void {
  const m = w.map;
  let changed = false;
  for (let y = ty - ry; y <= ty + ry; y++)
    for (let x = tx - rx; x <= tx + rx; x++) {
      if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) continue;
      const i = y * m.cols + x;
      if (m.tiles[i] === 2) { m.tiles[i] = 0; changed = true; }
    }
  if (changed) { w.flowDirty = true; w.mapDirty = true; }
}

/** A founder names the land after their own fashion. Deterministic by region id. */
export function nameRegionFor(w: World, r: Region, race: import('../data/races.ts').RaceKey): void {
  const pool = NAMES[race];
  const used = new Set(w.regions.map((q) => q.name));
  for (let k = 0; k < pool.length; k++) {
    const n = pool[(r.id * 7 + k) % pool.length];
    if (!used.has(n)) { r.name = n; return; }
  }
}

export function placeSettlement(w: World, slot: number, x: number, y: number, tier: Tier, instant = false): Settlement {
  settlementsChanged();
  clearFootprint(w, (x / TILE) | 0, (y / TILE) | 0);
  const b = mkSettlement(w, slot, x, y, tier, instant);
  w.slots[slot].settlements.push(b);
  return b;
}

/** Start an in-place upgrade. The settlement keeps its hp fraction, loses production until done. */
export const isCapital = (w: World, b: Settlement): boolean => w.capitals[b.team] === b.region && b.hp > 0;

/** Why a settlement cannot grow yet, or null. Gold and materials are checked by the command. */
export function canGrow(w: World, b: Settlement): string | null {
  const to = NEXT_TIER[b.tier];
  if (!to) return 'a city is as big as it gets';
  if (b.buildT > 0) return 'still building';
  const need = GROW[to];
  if (!need) return null;
  const blds = buildingsOf(w, b);
  const has = (k: BldKey): boolean => blds.some((x) => x.type === k);
  const missing: string[] = [];
  if (w.rules.civilians && b.civ.residents < need.people) missing.push(need.people + ' people (' + b.civ.residents + ')');
  const houses = blds.filter((x) => x.type === 'house').length;
  if (houses < need.houses) missing.push(need.houses + ' house' + (need.houses > 1 ? 's' : '') + ' (' + houses + ')');
  for (const k of need.all) if (!has(k)) missing.push('a ' + BLD[k].name.toLowerCase());
  for (const group of need.any) if (!group.some(has)) missing.push('a ' + group.map((k) => BLD[k].name.toLowerCase()).join(' or '));
  return missing.length ? 'needs ' + missing.join(', ') : null;
}

export function startUpgrade(b: Settlement, to: Tier): void {
  const frac = b.hp / b.max;
  b.tier = to;
  b.max = TIERS[to].hp;
  b.hp = Math.max(1, Math.round(b.max * frac * 0.6));
  b.buildT = TIERS[to].buildT;
}

export function popCap(w: World, slot: number): number {
  let cap = 10;
  for (const b of w.slots[slot].settlements) if (b.hp > 0 && b.buildT <= 0) cap += TIERS[b.tier].pop;
  if (w.rules.town) cap += townPop(w, slot);
  return cap;
}

export function popUsed(w: World, slot: number): number {
  let n = 0;
  for (const u of w.units) if (u.team === slot && u.hp > 0 && TYPES[u.type].role !== 'civ') n += Math.max(1, Math.ceil(TYPES[u.type].cost / 60));
  for (const q of w.slots[slot].queue) n += Math.max(1, Math.ceil(TYPES[q.unit].cost / 60));
  return n;
}

export function hasCity(w: World, slot: number): boolean {
  return w.slots[slot].settlements.some((b) => b.hp > 0 && b.tier === 'city' && b.buildT <= 0);
}

/** Gold per second a slot pays for what it fields. */
export function upkeepRate(w: World, slot: number): number {
  let u = 0;
  for (const x of w.units) if (x.team === slot && x.hp > 0 && TYPES[x.type].role !== 'civ') u += TYPES[x.type].cost / 100;
  for (const b of w.blds) if (b.team === slot && b.kind === 'tower') u += BLD[b.type].cost / 400;
  for (const b of w.slots[slot].settlements) if (b.hp > 0) u += TIERS[b.tier].upkeep;
  return u;
}

/** Gross gold: 2 base, plus each connected working settlement, plus mines. */
export function grossIncome(w: World, slot: number, mcount: number[]): number {
  // With civilians, towns pay through staffed jobs. Without, buildings pay flat.
  let g = 2 + 1.5 * mcount[slot] + (w.rules.civilians ? civIncome(w, slot) : w.rules.town ? townIncome(w, slot) : 0);
  if (cheat(w, slot, 'fastEcon')) g *= 5;
  for (const b of w.slots[slot].settlements) {
    if (b.hp <= 0) continue;
    const r = w.regions[b.region];
    if (r && w.rules.connection && !r.connected) continue;
    let inc = TIERS[b.tier].income;
    if (b.buildT > 0) inc *= 0.5;
    if (r && w.rules.garrison && r.garrison < r.need) inc *= 0.5;
    if (r && w.rules.unrest && r.unrest >= 50) inc *= 0.5;
    g += inc;
  }
  return g;
}

/** Materials per second: the land's yield in connected regions plus fortress and city works. */
export function matRate(w: World, slot: number): number {
  if (!w.rules.materials) return 0;
  let m = 0;
  for (const r of w.regions) if (r.owner === slot && r.connected) m += r.mat;
  for (const b of w.slots[slot].settlements) if (b.hp > 0 && b.buildT <= 0) m += TIERS[b.tier].matRate;
  return m;
}

function ownValueByRegion(w: World): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of w.units) {
    if (u.hp <= 0) continue;
    const r = regionAt(w, u.x, u.y);
    const k = w.slots[u.team].ally + ':' + r;
    m.set(k, (m.get(k) ?? 0) + TYPES[u.type].cost);
  }
  return m;
}

function hostileValueIn(w: World, byRegion: Map<string, number>, team: number, region: number): number {
  let v = 0;
  const seen = new Set<number>();
  for (const s of w.slots) {
    if (seen.has(s.ally)) continue;
    seen.add(s.ally);
    if (s.ally === w.slots[team].ally) continue;
    v += byRegion.get(s.ally + ':' + region) ?? 0;
  }
  return v;
}

/** A region revolts: its settlements go independent and rebels appear sized to the garrison shortfall. */
function revolt(w: World, r: Region): void {
  settlementsChanged();
  const owner = r.owner;
  const shortfall = Math.max(40, r.need - r.garrison);
  r.owner = -1;
  r.unrest = 0;
  r.claimT = 0;
  const n = w.neutral;
  if (n >= 0) {
    const s = w.slots[owner];
    for (const b of s.settlements.slice()) if (b.hp > 0 && b.region === r.id) {
      s.settlements.splice(s.settlements.indexOf(b), 1);
      b.team = n;
      w.slots[n].settlements.push(b);
    }
    const count = Math.min(8, Math.ceil(shortfall / 20));
    const list = roster(w.slots[n].race).filter((k) => TYPES[k].cost <= 30 && !TYPES[k].repair);
    for (let i = 0; i < count; i++) {
      const k = list[randInt(w.rng, list.length)];
      const a = (i / count) * Math.PI * 2;
      const u = mkUnit(w, n, k, r.cx + Math.cos(a) * 10, r.cy + Math.sin(a) * 10);
      u.order = { type: 'attack', tgt: null };
      w.units.push(u);
    }
  }
  if (owner === 0) { say(w, r.name + ' has revolted', 3); pushEvent(w, 'revolt', r.name + ' revolted', r.cx, r.cy, r.id); chronicle(w, r.name + ' revolted'); }
}

/** Neutral camps raid, ruins reward the units that hold them, loot drops from cleared camps. */
function neutralsTick(w: World, dt: number, byRegion: Map<string, number>): void {
  const n = w.neutral;
  if (n < 0) return;
  const ns = w.slots[n];
  const raiders = w.units.filter((u) => u.team === n && u.hp > 0).length;
  for (const b of ns.settlements.slice()) {
    if (b.hp <= 0) continue;
    if (b.tier === 'camp') {
      b.nT -= dt;
      if (b.nT <= 0 && raiders < 10) {
        b.nT = 90;
        const r = w.regions[b.region];
        // Raid a neighboring region that someone owns, else prowl a random neighbor.
        const owned = r.adj.filter((a) => w.regions[a].owner >= 0 && !w.slots[w.regions[a].owner].neutral);
        const pick = owned.length ? owned[randInt(w.rng, owned.length)] : r.adj[randInt(w.rng, r.adj.length)];
        const target = w.regions[pick];
        const list = roster(ns.race).filter((k) => TYPES[k].cost <= 40 && !TYPES[k].repair);
        for (let i = 0; i < 2; i++) {
          const u = mkUnit(w, n, list[randInt(w.rng, list.length)], b.x + (i ? 8 : -8), b.y + 12);
          u.order = { type: 'move', x: target.cx + (rand(w.rng) - 0.5) * 40, y: target.cy + (rand(w.rng) - 0.5) * 40 };
          w.units.push(u);
        }
        if (target.owner === 0) pushEvent(w, 'raid', 'Bandits from ' + r.name + ' are raiding ' + target.name, b.x, b.y, r.id);
      }
    } else if (b.tier === 'ruin') {
      // Whoever stands on a ruin alone for five seconds claims what it holds.
      let claimant = -1;
      for (const s of w.slots) {
        if (s.neutral) continue;
        const v = byRegion.get(s.ally + ':' + b.region) ?? 0;
        if (v > 0) {
          let near = false;
          for (const u of w.units) if (u.hp > 0 && allied(w, u.team, w.slots.indexOf(s)) && Math.hypot(u.x - b.x, u.y - b.y) < 20) { near = true; break; }
          if (near) { claimant = claimant < 0 ? w.slots.indexOf(s) : -2; }
        }
      }
      if (claimant >= 0) {
        b.nT += dt;
        if (b.nT >= 5) {
          ns.settlements.splice(ns.settlements.indexOf(b), 1);
          const s = w.slots[claimant];
          if (rand(w.rng) < 0.5) { s.mat += 80; if (claimant === 0) say(w, 'The ruin held 80 materials', 2.5); }
          else {
            const list = roster(s.race).filter((k) => TYPES[k].cost >= 40 && TYPES[k].cost <= 60);
            const u = mkUnit(w, claimant, list[randInt(w.rng, list.length)], b.x, b.y + 10);
            w.units.push(u);
            if (claimant === 0) say(w, 'A ' + TYPES[u.type].name + ' joins you from the ruin', 2.5);
          }
          if (claimant === 0) pushEvent(w, 'loot', 'Ruin claimed', b.x, b.y, b.region);
        }
      } else b.nT = 0;
    }
  }
}

/** Called when a settlement dies. Camps drop loot to whoever finished them. */
const TIER_RANK: Record<Tier, number> = { city: 5, fortress: 4, town: 3, village: 2, outpost: 1, camp: 0, ruin: 0 };

export function onSettlementDeath(w: World, b: Settlement): void {
  settlementsChanged();
  // The crown passes to the biggest surviving settlement.
  if (!w.slots[b.team].neutral && w.capitals[b.team] === b.region) {
    const heir = w.slots[b.team].settlements.filter((x) => x.hp > 0 && x !== b && x.tier !== 'outpost').sort((p, q) => TIER_RANK[q.tier] - TIER_RANK[p.tier] || q.hp - p.hp)[0];
    if (heir) {
      w.capitals[b.team] = heir.region;
      if (b.team === 0) { say(w, 'The capital has fallen. ' + w.regions[heir.region].name + ' is the capital now.', 4); pushEvent(w, 'lost', 'Capital moved to ' + w.regions[heir.region].name, heir.x, heir.y, heir.region); chronicle(w, 'The capital fell. ' + w.regions[heir.region].name + ' became the capital'); }
      else chronicle(w, TNAME[b.team] + ' lost its capital');
      w.flowDirty = true;
    }
  }
  if (!w.slots[b.team].neutral || b.tier !== 'camp' || b.hitBy < 0) return;
  const s = w.slots[b.hitBy];
  s.gold += 120;
  s.mat += 60;
  if (b.hitBy === 0) { say(w, 'Bandit camp cleared: 120 gold, 60 materials', 3); pushEvent(w, 'loot', 'Bandit camp cleared', b.x, b.y, b.region); }
}

/** Why `slot` cannot take this settlement now, or null. The UI shows the reason verbatim. */
export function canCapture(w: World, slot: number, b: Settlement): string | null {
  if (b.team === slot) return 'already yours';
  const neutral = isNeutral(w, b.team);
  if (neutral && b.tier === 'ruin') return 'stand on the ruin to claim it';
  if (neutral && b.tier === 'camp') return b.hp > 0 ? 'raze the camp' : null;
  if (neutral) return canAbsorb(w, slot, b);
  if (b.hp > 0) return 'still standing: bring it down first';
  let near = false;
  for (const u of w.units) if (u.hp > 0 && u.team === slot && TYPES[u.type].role !== 'civ' && Math.hypot(u.x - b.x, u.y - b.y) < 40) { near = true; break; }
  if (!near) return 'bring soldiers to it';
  for (const u of w.units) if (u.hp > 0 && !allied(w, u.team, slot) && TYPES[u.type].dmg > 0 && Math.hypot(u.x - b.x, u.y - b.y) < 56) return 'enemy units still defending';
  const r = w.regions[b.region];
  if (r && !(r.owner === slot || r.adj.some((a) => w.regions[a].owner === slot) || cheat(w, slot, 'territory'))) return 'not next to your territory';
  return null;
}

export const CAPTURE_COST = 100;

/** Take a razed enemy settlement: it stands again at a third, its buildings change hands, the region follows. */
export function capture(w: World, slot: number, b: Settlement): void {
  settlementsChanged();
  const from = b.team;
  const os = w.slots[from];
  os.settlements.splice(os.settlements.indexOf(b), 1);
  b.team = slot;
  b.hp = Math.max(1, Math.round(b.max * 0.3));
  b.hitBy = -1;
  b.buildT = 0;
  w.slots[slot].settlements.push(b);
  for (const bl of w.blds) if (bl.team === from && Math.hypot(bl.x - b.x, bl.y - b.y) < 70) bl.team = slot;
  const r = w.regions[b.region];
  if (r) { r.owner = slot; r.claimant = slot; r.claimT = 0; r.unrest = w.rules.unrest ? 40 : 0; }
  if (w.capitals[from] === b.region) w.capitals[from] = os.settlements.find((x) => x.hp > 0)?.region ?? -1;
  w.flowDirty = true;
  const name = r?.name ?? 'the settlement';
  if (slot === 0) { say(w, 'Captured ' + name, 3); pushEvent(w, 'claim', 'Captured ' + name, b.x, b.y, b.region); }
  chronicle(w, (slot === 0 ? 'Captured ' : TNAME[slot] + ' captured ') + name + ' from ' + TNAME[from]);
}

/** Absorb an independent village: it joins with its buildings intact. */
export function canAbsorb(w: World, slot: number, b: Settlement): string | null {
  if (!w.slots[b.team].neutral || b.tier === 'camp' || b.tier === 'ruin') return 'not an independent settlement';
  let near = false;
  for (const u of w.units) if (u.hp > 0 && u.team === slot && Math.hypot(u.x - b.x, u.y - b.y) < 40) near = true;
  if (!near) return 'bring units to it first';
  for (const u of w.units) if (u.hp > 0 && !allied(w, u.team, slot) && !isNeutral(w, u.team) && Math.hypot(u.x - b.x, u.y - b.y) < 48) return 'enemies nearby';
  const r = w.regions[b.region];
  if (!(r.owner === slot || r.adj.some((a) => w.regions[a].owner === slot))) return 'not next to your territory';
  return null;
}

export function absorb(w: World, slot: number, b: Settlement): void {
  settlementsChanged();
  const ns = w.slots[b.team];
  ns.settlements.splice(ns.settlements.indexOf(b), 1);
  b.team = slot;
  w.slots[slot].settlements.push(b);
  for (const bl of w.blds) if (bl.team === w.neutral && Math.hypot(bl.x - b.x, bl.y - b.y) < 60) bl.team = slot;
  w.flowDirty = true;
}

/** Attitudes drift with borders, strength, shared enemies, and aggression. AI rivals act on them. */
function diplomacyTick(w: World, dt: number, value: number[]): void {
  if (!w.rules.diplomacy) return;
  for (let i = 0; i < w.nP; i++) {
    const A = w.slots[i];
    if (A.neutral) continue;
    for (let j = 0; j < w.nP; j++) {
      if (i === j || w.slots[j].neutral || A.ally === w.slots[j].ally) continue;
      let d = 0.05 + PERSONAS[A.race].temper;
      const border = w.regions.some((r) => r.owner === i && r.adj.some((a) => w.regions[a].owner === j));
      if (border) d -= 0.25;
      if (value[j] > value[i] * 1.5) d -= 0.15;
      for (let k = 0; k < w.nP; k++) if (k !== i && k !== j && !w.slots[k].neutral && !w.slots[i].truce[k] && !w.slots[j].truce[k] && w.slots[k].ally !== A.ally && w.slots[k].ally !== w.slots[j].ally) d += 0.1;
      if (A.pact[j]) d += 0.08;
      A.attitude[j] = Math.max(-100, Math.min(100, A.attitude[j] + d * dt + (A.attitude[j] > 0 ? -0.02 : 0.02) * dt));
    }
  }
  // AI rivals decide once a second.
  if (w.tick % 60 !== 0) return;
  for (let i = 0; i < w.nP; i++) {
    const A = w.slots[i];
    if (!A.ai || A.neutral) continue;
    for (let j = 0; j < w.nP; j++) {
      if (i === j || w.slots[j].neutral || A.ally === w.slots[j].ally) continue;
      // A soured alliance ends before a war can start.
      if (A.pact[j] && A.attitude[j] < -20) setPact(w, i, j, false);
      const truce = A.truce[j];
      const peace = truce && w.t - A.truceT[j] > PEACE_AFTER;
      if (!truce && A.attitude[j] > 20 && value[i] < value[j] * 0.8) setTruce(w, i, j, true);
      else if (truce && !peace && A.attitude[j] < -40 && value[i] > value[j] * 1.5) setTruce(w, i, j, false);
      else if (peace && A.attitude[j] < -70) setTruce(w, i, j, false);
    }
  }
}

export function setTruce(w: World, a: number, b: number, on: boolean): void {
  const A = w.slots[a], B = w.slots[b];
  if (A.truce[b] === on) return;
  A.truce[b] = on; B.truce[a] = on;
  A.truceT[b] = w.t; B.truceT[a] = w.t;
  if (!on) { A.attitude[b] = Math.min(A.attitude[b], -30); B.attitude[a] = Math.min(B.attitude[a], -30); if (A.pact[b]) { A.pact[b] = false; B.pact[a] = false; } }
  w.flowDirty = true;
  const other = a === 0 ? b : b === 0 ? a : -1;
  if (other >= 0) {
    const name = ['BLUE', 'RED', 'GREEN', 'ORANGE', 'VIOLET'][other];
    const cap = w.regions[w.capitals[other]];
    say(w, on ? 'Peace with ' + name : name + ' is at war with you', 3);
    pushEvent(w, on ? 'truce' : 'war', on ? 'Peace with ' + name : name + ' declared war', cap?.cx ?? 0, cap?.cy ?? 0, cap?.id ?? -1);
    chronicle(w, on ? 'Peace with ' + name : 'War with ' + name);
  } else if (!A.neutral && !B.neutral) chronicle(w, on ? 'Peace between ' + TNAME[a] + ' and ' + TNAME[b] : 'War between ' + TNAME[a] + ' and ' + TNAME[b]);
}

/** Can this pair sign a truce now? Rivals accept when not hostile or when they are weaker. */
export function setPact(w: World, a: number, b: number, on: boolean): void {
  const A = w.slots[a], B = w.slots[b];
  if (!!A.pact[b] === on) return;
  A.pact[b] = on; B.pact[a] = on;
  if (on) { setTruce(w, a, b, true); A.attitude[b] = Math.max(A.attitude[b], 40); B.attitude[a] = Math.max(B.attitude[a], 40); }
  w.flowDirty = true;
  const other = a === 0 ? b : b === 0 ? a : -1;
  if (other >= 0) {
    const name = TNAME[other];
    const cap = w.regions[w.capitals[other]];
    say(w, on ? 'Alliance with ' + name : 'The alliance with ' + name + ' is over', 3);
    pushEvent(w, on ? 'truce' : 'war', on ? 'Alliance with ' + name : 'Alliance with ' + name + ' ended', cap?.cx ?? 0, cap?.cy ?? 0, cap?.id ?? -1);
    chronicle(w, on ? 'Alliance with ' + name : 'The alliance with ' + name + ' ended');
  } else if (!A.neutral && !B.neutral) chronicle(w, (on ? 'Alliance between ' : 'The alliance ended between ') + TNAME[a] + ' and ' + TNAME[b]);
}

/** Would `to` swear an alliance with `from`? Warm enough, or a shared enemy at the door. */
export function allyAccepted(w: World, from: number, to: number): boolean {
  const T = w.slots[to];
  if (!T.ai) return true;
  if (!T.truce[from]) return false;
  const shared = w.slots.some((x, k) => k !== from && k !== to && !x.neutral && x.alive && !T.truce[k] && !w.slots[from].truce[k]);
  return T.attitude[from] >= PERSONAS[T.race].allyAt || (shared && T.attitude[from] > 0);
}

/** Plain words for how two sides stand. */
export function relation(w: World, a: number, b: number): 'allied' | 'peace' | 'war' {
  if (w.slots[a].pact[b] || w.slots[a].ally === w.slots[b].ally) return 'allied';
  return w.slots[a].truce[b] ? 'peace' : 'war';
}

export function truceAccepted(w: World, from: number, to: number, value: number[]): boolean {
  const T = w.slots[to];
  if (!T.ai) return true;
  return T.attitude[from] > -20 || value[to] < value[from] * 0.7;
}

/** Claims, contests, connection, garrison, unrest, neutrals, economy, diplomacy, and the win check. */
export function conquestTick(w: World, dt: number, mcount: number[]): void {
  const byRegion = ownValueByRegion(w);
  const allyOf = w.slots.map((s) => s.ally);
  const value = w.slots.map(() => 0);
  for (const u of w.units) if (u.hp > 0) value[u.team] += TYPES[u.type].cost;
  // Claims and contests.
  for (const r of w.regions) {
    const here = settlementsIn(w, r.id).filter((b) => !isNeutral(w, b.team));
    const teams = new Set(here.map((b) => allyOf[b.team]));
    r.contested = false;
    r.claimant = -1;
    if (teams.size === 1) {
      const owner = here[0].team;
      r.claimant = owner;
      const hostilePresent = hostileValueIn(w, byRegion, owner, r.id) > 0;
      r.contested = hostilePresent;
      if (r.owner === owner) r.claimT = 0;
      else if (!hostilePresent) {
        r.claimT += dt;
        if (r.claimT >= CLAIM_SECONDS) {
          const prev = r.owner;
          r.owner = owner;
          r.claimT = 0;
          r.unrest = w.rules.unrest && prev >= 0 ? 60 : 0;
          if (owner === 0) { say(w, r.name + ' is yours', 2.5); pushEvent(w, 'claim', r.name + ' claimed', r.cx, r.cy, r.id); }
          else if (prev === 0) { say(w, r.name + ' has fallen to the enemy', 2.5); pushEvent(w, 'lost', r.name + ' lost', r.cx, r.cy, r.id); }
        }
      } else r.claimT = 0;
    } else {
      r.contested = teams.size > 1;
      if (r.owner >= 0 && teams.size === 0) {
        const hostile = hostileValueIn(w, byRegion, r.owner, r.id);
        const ownHere = byRegion.get(allyOf[r.owner] + ':' + r.id) ?? 0;
        if (hostile > 0 && ownHere === 0) {
          r.claimT += dt;
          const limit = w.rules.garrison && r.garrison < r.need ? WEAK_CLAIM_SECONDS : CLAIM_SECONDS;
          if (r.claimT >= limit) { if (r.owner === 0) { say(w, r.name + ' lost', 2.5); pushEvent(w, 'lost', r.name + ' lost', r.cx, r.cy, r.id); } r.owner = -1; r.claimT = 0; r.unrest = 0; }
        } else r.claimT = 0;
      } else r.claimT = 0;
    }
  }
  // Garrison requirement. Fortresses halve it here and next door; cities two regions out.
  for (const r of w.regions) {
    if (r.owner < 0) { r.garrison = 0; r.need = 0; continue; }
    r.garrison = byRegion.get(allyOf[r.owner] + ':' + r.id) ?? 0;
    let hostileAdj = 0;
    for (const a of r.adj) { const o = w.regions[a].owner; if (o >= 0 && allyOf[o] !== allyOf[r.owner] && !w.slots[o].truce[r.owner]) hostileAdj++; }
    // Security follows what can be seen: every hostile neighbor asks for a real garrison.
    // Interior regions and a realm at peace need none.
    let need = 60 * hostileAdj;
    const strong = (reg: number, tiers: Tier[]): boolean => settlementsIn(w, reg).some((b) => tiers.includes(b.tier) && b.buildT <= 0 && b.team === r.owner);
    const fortNear = strong(r.id, ['fortress', 'city']) || r.adj.some((a) => strong(a, ['fortress', 'city'])) || castleNear(w, r.owner, r.cx, r.cy, 110);
    const cityTwo = r.adj.some((a) => w.regions[a].adj.some((b) => strong(b, ['city'])));
    if (fortNear || cityTwo) need *= 0.5;
    r.need = w.rules.garrison ? need : 0;
  }
  // Connection: every region must trace own-owned regions back to the capital.
  for (let i = 0; i < w.nP; i++) {
    if (w.slots[i].neutral) continue;
    const cap = w.capitals[i];
    const seen = new Set<number>();
    if (cap >= 0 && w.regions[cap].owner === i) {
      const stack = [cap];
      while (stack.length) {
        const r = stack.pop()!;
        if (seen.has(r)) continue;
        seen.add(r);
        for (const a of w.regions[r].adj) if (w.regions[a].owner === i && !seen.has(a)) stack.push(a);
      }
    }
    for (const r of w.regions) if (r.owner === i) {
      const was = r.connected;
      r.connected = !w.rules.connection || seen.has(r.id);
      if (was && !r.connected && i === 0) pushEvent(w, 'attack', r.name + ' is cut off from the capital', r.cx, r.cy, r.id);
    }
  }
  // Unrest.
  if (w.rules.unrest)
    for (const r of w.regions) {
      if (r.owner < 0 || isNeutral(w, r.owner)) continue;
      // The capital's own people do not revolt over a thin garrison. Other regions grind when short;
      // a broken connection is the emergency. Full shortfall revolts in about 70 seconds.
      const short = r.garrison < r.need && r.id !== w.capitals[r.owner];
      let d = short ? 0.4 + 1.0 * Math.min(1, (r.need - r.garrison) / Math.max(1, r.need)) : -1.5;
      if (!r.connected) d = Math.max(d, 0) + 1.2;
      // A working town is a content one.
      if (w.rules.civilians) for (const b of settlementsIn(w, r.id)) if (b.team === r.owner && b.civ.jobs > 0 && b.civ.employed >= b.civ.jobs * 0.6 && b.civ.state !== 'attacked') { d -= 0.5; break; }
      const calm = settlementsIn(w, r.id).some((b) => (b.tier === 'fortress' || b.tier === 'city') && b.buildT <= 0 && b.team === r.owner) || r.adj.some((a) => settlementsIn(w, a).some((b) => (b.tier === 'fortress' || b.tier === 'city') && b.buildT <= 0 && b.team === r.owner)) || castleNear(w, r.owner, r.cx, r.cy, 110);
      if (calm) d -= 1;
      const before = r.unrest;
      r.unrest = Math.max(0, Math.min(100, r.unrest + d * dt));
      if (r.owner === 0) {
        if (before < 50 && r.unrest >= 50) pushEvent(w, 'unrest', 'Unrest rising in ' + r.name, r.cx, r.cy, r.id);
        if (before < 80 && r.unrest >= 80) pushEvent(w, 'unrest', r.name + ' is close to revolt', r.cx, r.cy, r.id);
      }
      if (r.unrest >= 100) revolt(w, r);
    }
  // Construction and upgrades.
  for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0 && b.buildT > 0) {
    b.buildT -= dt;
    if (b.buildT <= 0) {
      b.buildT = 0;
      const r = w.regions[b.region];
      if (b.team === 0) { say(w, r.name + ' is now a ' + b.tier, 2.5); pushEvent(w, 'built', r.name + ' is now a ' + b.tier, b.x, b.y, b.region); }
      if (b.tier !== 'outpost') chronicle(w, (b.team === 0 ? '' : TNAME[b.team] + ': ') + r.name + ' became a ' + b.tier);
    }
  }
  neutralsTick(w, dt, byRegion);
  // Income minus upkeep, materials, then desertion when broke.
  for (let i = 0; i < w.nP; i++) {
    const s = w.slots[i];
    if (!s.alive || s.neutral) continue;
    const net = grossIncome(w, i, mcount) - (w.rules.upkeep ? upkeepRate(w, i) : 0);
    const was = w.net[i];
    w.net[i] = net;
    if (i === 0 && was >= 0 && net < 0 && w.tick > 60) pushEvent(w, 'broke', 'Net income is negative', w.slots[0].settlements[0]?.x ?? 0, w.slots[0].settlements[0]?.y ?? 0, w.capitals[0]);
    s.gold += net * dt;
    s.mat += matRate(w, i) * dt;
    if (s.gold < 0) {
      s.gold = 0;
      w.broke[i] += dt;
      if (w.broke[i] >= 8) {
        w.broke[i] = 0;
        let worst: Unit | null = null;
        for (const u of w.units) if (u.team === i && u.hp > 0 && (!worst || TYPES[u.type].cost > TYPES[worst.type].cost)) worst = u;
        if (worst) { worst.hp = 0; if (i === 0) say(w, TYPES[worst.type].name + ' deserted. You cannot pay the army.', 3); }
      }
    } else w.broke[i] = 0;
  }
  // Threat events for the player's regions.
  for (const r of w.regions) {
    if (r.owner !== 0) continue;
    const hostile = hostileValueIn(w, byRegion, 0, r.id);
    const key = 'thr' + r.id;
    const had = (w as unknown as Record<string, number>)[key] ?? 0;
    if (hostile > 0 && had === 0) pushEvent(w, 'attack', r.name + ' is under attack', r.cx, r.cy, r.id);
    (w as unknown as Record<string, number>)[key] = hostile;
  }
  diplomacyTick(w, dt, value);
  w.day = Math.floor(w.t / DAY);
  realmEvents(w, dt);
  regroup(w);
  checkFeats(w, dt);
}

/** Accomplishments. Each fires once, with a notice, and the realm goes on. */
function checkFeats(w: World, dt: number): void {
  const s = w.slots[0];
  const cap = s.settlements.find((b) => b.hp > 0);
  if (!cap) return;
  const has = (k: FeatKey): boolean => w.feats.includes(k);
  const earn = (k: FeatKey): void => {
    w.feats.push(k);
    say(w, FEATS[k].name + '. ' + FEATS[k].text, 4);
    pushEvent(w, 'feat', FEATS[k].name, cap.x, cap.y, cap.region);
    chronicle(w, FEATS[k].name + ': ' + FEATS[k].text);
  };
  if (!has('kingdom') && s.settlements.filter((b) => b.hp > 0 && b.tier !== 'outpost' && b.buildT <= 0).length >= FEAT_RULES.kingdomTowns) earn('kingdom');
  if (!has('greatCity') && s.settlements.some((b) => b.hp > 0 && b.tier === 'city' && b.buildT <= 0)) earn('greatCity');
  if (!has('empire')) {
    const share = w.regions.filter((r) => r.owner === 0).length / w.regions.length;
    const rec = w as unknown as Record<string, number>;
    rec.holdT = share >= FEAT_RULES.empireShare ? (rec.holdT ?? 0) + dt : 0;
    if (rec.holdT >= 60) earn('empire');
  }
  if (!has('conqueror')) {
    let rivals = 0, gone = 0;
    for (let i = 1; i < w.nP; i++) if (!w.slots[i].neutral) { rivals++; if (!w.slots[i].alive) gone++; }
    if (rivals && gone === rivals) earn('conqueror');
  }
  if (!has('greatPower')) {
    let army = 0;
    for (const u of w.units) if (u.team === 0 && u.hp > 0) army += TYPES[u.type].cost;
    if (army >= FEAT_RULES.greatPowerArmy && w.net[0] >= FEAT_RULES.greatPowerNet) earn('greatPower');
  }
  if (!has('survivor') && w.day >= FEAT_RULES.survivorDays) earn('survivor');
}

/** Losing the last settlement is a crisis, not the end: the people regroup in free land. */
function regroup(w: World): void {
  settlementsChanged();
  const s = w.slots[0];
  if (w.over || s.settlements.some((b) => b.hp > 0)) return;
  const free = w.regions.filter((r) => r.owner < 0 && !settlementsIn(w, r.id).some((b) => !isNeutral(w, b.team) || b.tier === 'camp'));
  if (!free.length) { w.over = 'lose'; return; }
  // Farthest from any rival capital.
  free.sort((a, b) => nearestRival(w, b) - nearestRival(w, a));
  for (const r of free) {
    for (let t = 0; t < 12; t++) {
      const ang = t * 0.9, rad = t * 6;
      const x = r.cx + Math.cos(ang) * rad, y = r.cy + Math.sin(ang) * rad;
      if (placeOk(w, (x / TILE) | 0, (y / TILE) | 0) === null) {
        const b = placeSettlement(w, 0, x, y, 'village', true);
        r.owner = 0; r.claimant = 0; r.unrest = 0;
        w.capitals[0] = r.id;
        s.gold = Math.max(s.gold, 300);
        s.alive = true;
        say(w, 'Your last settlement fell. The people regroup in ' + r.name + '.', 4);
        pushEvent(w, 'lost', 'Regrouped in ' + r.name, b.x, b.y, r.id);
        chronicle(w, 'The last settlement fell. The people regrouped in ' + r.name);
        w.flowDirty = true;
        return;
      }
    }
  }
  w.over = 'lose';
}

function nearestRival(w: World, r: Region): number {
  let d = Infinity;
  for (let i = 1; i < w.nP; i++) { const c = w.capitals[i]; if (c >= 0 && !w.slots[i].neutral) d = Math.min(d, Math.hypot(w.regions[c].cx - r.cx, w.regions[c].cy - r.cy)); }
  return d;
}

/** Something happens every few minutes. Some events ask a question and wait for the answer. */
function realmEvents(w: World, dt: number): void {
  // Caravans on the road: pay out on arrival.
  for (const u of w.units) {
    if (u.type !== 'caravan' || u.hp <= 0 || u.home !== -2) continue;
    const t = w.slots[u.team].settlements.find((b) => b.id === u.job);
    if (!t || t.hp <= 0) { u.hp = -1; continue; }
    if (Math.hypot(u.x - t.x, u.y - t.y) < 18) {
      u.hp = -1;
      w.slots[u.team].gold += 100;
      if (u.team === 0) { say(w, 'The caravan reached ' + (w.regions[t.region]?.name ?? 'town') + ': 100 gold', 3); pushEvent(w, 'loot', 'Caravan arrived: 100 gold', t.x, t.y, t.region); }
    }
  }
  if (w.pending) return;
  w.eventT -= dt;
  if (w.eventT > 0) return;
  w.eventT = 150 + rand(w.rng) * 90;
  const own = w.regions.filter((r) => r.owner === 0);
  const rivals = w.slots.map((_, i) => i).filter((i) => i > 0 && !w.slots[i].neutral && w.slots[i].alive);
  const cap = w.slots[0].settlements.find((b) => b.hp > 0);
  if (!own.length || !cap) return;
  const roll = rand(w.rng);
  if (roll < 0.26 && w.neutral >= 0) {
    // A raid: bandits come from the nearest camp, or from the map's edge, and march on a region.
    const r = own[randInt(w.rng, own.length)];
    const n = w.neutral;
    const camps = w.slots[n].settlements.filter((b) => b.hp > 0 && b.tier === 'camp');
    let ox: number, oy: number;
    if (camps.length) {
      const c = camps.sort((p, q) => Math.hypot(p.x - r.cx, p.y - r.cy) - Math.hypot(q.x - r.cx, q.y - r.cy))[0];
      ox = c.x; oy = c.y + 12;
    } else {
      const W = w.map.cols * TILE, H = w.map.rows * TILE;
      const edges: [number, number][] = [[r.cx, 12], [r.cx, H - 12], [12, r.cy], [W - 12, r.cy]];
      [ox, oy] = edges.sort((p, q) => Math.hypot(p[0] - r.cx, p[1] - r.cy) - Math.hypot(q[0] - r.cx, q[1] - r.cy))[0];
    }
    const count = 3 + Math.min(4, Math.floor(w.day / 4));
    spawnRaiders(w, r, ox, oy, count);
  } else if (roll < 0.44 && rivals.length) {
    const i = rivals[randInt(w.rng, rivals.length)], name = TNAME[i];
    const S = w.slots[0];
    if (!S.truce[i]) {
      w.pending = { kind: 'truce', slot: i, text: name + ' sends an envoy offering peace.', yes: 'Accept peace', no: 'Send them away' };
    } else if (!S.pact[i] && w.slots[i].attitude[0] >= PERSONAS[w.slots[i].race].allyAt - 10) {
      w.pending = { kind: 'ally', slot: i, text: name + ' proposes an alliance: shared sight, open borders, common enemies.', yes: 'Swear the alliance', no: 'Decline' };
    } else {
      const ask = 60 + w.day * 10;
      w.pending = { kind: 'tribute', slot: i, text: name + ' demands ' + ask + ' gold as tribute.', yes: 'Pay ' + ask + ' gold', no: 'Refuse' };
    }
    pushEvent(w, 'war', 'An envoy from ' + name + ' waits', cap.x, cap.y, cap.region);
  } else if (roll < 0.56) {
    // A caravan sets out from the nearest edge for one of your towns. It pays when it arrives, if it arrives.
    const towns = w.slots[0].settlements.filter((b) => b.hp > 0 && b.tier !== 'outpost');
    const t = towns[randInt(w.rng, towns.length)];
    const W = w.map.cols * TILE, H = w.map.rows * TILE;
    const edges: [number, number][] = [[t.x, 10], [t.x, H - 10], [10, t.y], [W - 10, t.y]];
    const far = edges.sort((p, q) => Math.hypot(q[0] - t.x, q[1] - t.y) - Math.hypot(p[0] - t.x, p[1] - t.y))[0];
    const u = mkUnit(w, 0, 'caravan', far[0], far[1]);
    u.home = -2;
    u.job = t.id;
    u.order = { type: 'move', x: t.x, y: t.y + 12 };
    w.units.push(u);
    say(w, 'A caravan is on the road to ' + (w.regions[t.region]?.name ?? 'your town') + '. Keep it safe.', 3);
    pushEvent(w, 'loot', 'Caravan bound for ' + (w.regions[t.region]?.name ?? 'town'), u.x, u.y, t.region);
  } else if (roll < 0.66) {
    // Migrants: a safe town with room and work draws people.
    const draw = w.slots[0].settlements.filter((b) => b.hp > 0 && b.tier !== 'outpost' && b.civ.state !== 'attacked' && b.civ.residents + 2 <= b.civ.housing && b.civ.employed < b.civ.jobs);
    if (draw.length) {
      const t = draw[randInt(w.rng, draw.length)];
      seedResidents(w, t, 2);
      t.civ.residents += 2;
      say(w, 'Migrants settle in ' + (w.regions[t.region]?.name ?? 'your town'), 3);
      pushEvent(w, 'claim', 'Migrants settle in ' + (w.regions[t.region]?.name ?? 'town'), t.x, t.y, t.region);
    }
  } else if (roll < 0.76 && w.rules.unrest) {
    const r = own[randInt(w.rng, own.length)];
    r.unrest = Math.min(95, r.unrest + 30);
    say(w, 'Sickness in ' + r.name + '. Unrest is up.', 3);
    pushEvent(w, 'unrest', 'Sickness in ' + r.name, r.cx, r.cy, r.id);
  } else if (roll < 0.86) {
    for (const r of own) r.unrest = Math.max(0, r.unrest - 20);
    w.slots[0].gold += 40;
    say(w, 'A good harvest. Unrest falls and the treasury gains 40.', 3);
    pushEvent(w, 'claim', 'A good harvest', cap.x, cap.y, cap.region);
  } else if (rivals.length && w.rules.diplomacy) {
    // A rival at peace with a grudge declares war.
    const angry = rivals.filter((i) => w.slots[0].truce[i] && w.slots[i].attitude[0] < 0);
    if (angry.length) setTruce(w, 0, angry[randInt(w.rng, angry.length)], false);
    else { const r = w.regions.filter((q) => q.owner < 0 && !settlementsIn(w, q.id).length); if (r.length && w.neutral >= 0) { const q = r[randInt(w.rng, r.length)]; placeSettlement(w, w.neutral, q.cx, q.cy, 'ruin', true); pushEvent(w, 'loot', 'Ruins uncovered in ' + q.name, q.cx, q.cy, q.id); } }
  }
}

/** Bandits from a point of origin march on a region's center. */
export function spawnRaiders(w: World, r: Region, ox: number, oy: number, count: number): void {
  const n = w.neutral;
  if (n < 0) return;
  const list = roster(w.slots[n].race).filter((k) => TYPES[k].cost <= 45 && !TYPES[k].repair && TYPES[k].role !== 'civ');
  for (let i = 0; i < count; i++) {
    const u = mkUnit(w, n, list[randInt(w.rng, list.length)], ox + (i % 3) * 6 - 6, oy + Math.floor(i / 3) * 6);
    u.order = { type: 'attack', tgt: null, x: r.cx, y: r.cy };
    w.units.push(u);
  }
  say(w, 'Raiders marching on ' + r.name, 3);
  pushEvent(w, 'raid', 'Raiders marching on ' + r.name, ox, oy, r.id);
}

/** Where a raid on a region would set out from: the nearest bandit camp, else the nearest map edge. */
export function raidOrigin(w: World, r: Region): { x: number; y: number } {
  const camps = w.neutral >= 0 ? w.slots[w.neutral].settlements.filter((b) => b.hp > 0 && b.tier === 'camp') : [];
  if (camps.length) { const c = camps.sort((p, q) => Math.hypot(p.x - r.cx, p.y - r.cy) - Math.hypot(q.x - r.cx, q.y - r.cy))[0]; return { x: c.x, y: c.y + 12 }; }
  const W = w.map.cols * TILE, H = w.map.rows * TILE;
  const edges: [number, number][] = [[r.cx, 12], [r.cx, H - 12], [12, r.cy], [W - 12, r.cy]];
  const e = edges.sort((p, q) => Math.hypot(p[0] - r.cx, p[1] - r.cy) - Math.hypot(q[0] - r.cx, q[1] - r.cy))[0];
  return { x: e[0], y: e[1] };
}

/** Answer the pending event. */
export function choose(w: World, yes: boolean): boolean {
  const p = w.pending;
  if (!p) return false;
  w.pending = null;
  const s = w.slots[0];
  if (p.kind === 'ally') {
    if (yes) setPact(w, 0, p.slot, true);
    else { w.slots[p.slot].attitude[0] -= 10; say(w, 'The envoy leaves without an answer they liked.', 3); }
  } else if (p.kind === 'truce') {
    if (yes) setTruce(w, 0, p.slot, true);
    else { w.slots[p.slot].attitude[0] -= 15; say(w, 'The envoy leaves. They will remember.', 3); }
  } else if (p.kind === 'tribute') {
    const ask = 60 + w.day * 10;
    if (yes && s.gold >= ask) { s.gold -= ask; w.slots[p.slot].attitude[0] += 25; say(w, 'Tribute paid. Relations warm.', 3); }
    else if (yes) { say(w, 'You cannot pay. They take it as a refusal.', 3); w.slots[p.slot].attitude[0] -= 25; }
    else { w.slots[p.slot].attitude[0] -= 25; say(w, 'Refused. Watch the border.', 3); }
  } else if (p.kind === 'caravan') {
    if (yes) { s.gold += 80; say(w, 'The traders pay 80 gold', 2.5); }
    else say(w, 'The traders move on', 2);
  }
  return true;
}

/** Region ownership as a sortable list for the HUD and the territory list. */
export function heldRegions(w: World, slot: number): Region[] {
  return w.regions.filter((r) => r.owner === slot);
}

/** Lay out a Conquest world for `rivals` rivals plus neutrals. */
export function populateWorld(w: World, rng: Rng): void {
  const n = w.neutral;
  if (n < 0) return;
  const ns = w.slots[n];
  const capitals = new Set(w.capitals.filter((c) => c >= 0));
  const nearCap = new Set<number>();
  for (const c of capitals) { nearCap.add(c); for (const a of w.regions[c].adj) nearCap.add(a); }
  let free = w.regions.filter((r) => !nearCap.has(r.id));
  // Small worlds: anything that is not a capital will do.
  if (free.length < 3) free = w.regions.filter((r) => !capitals.has(r.id));
  const shuffled = free.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const kinds: Tier[] = ['camp', 'village', 'ruin', 'camp', 'village', 'ruin', 'camp'];
  let k = 0;
  for (const r of shuffled) {
    if (k >= kinds.length) break;
    const tier = kinds[k];
    let placed = false;
    for (let t = 0; t < 12 && !placed; t++) {
      const ang = t * 0.9, rad = t * 6;
      const x = r.cx + Math.cos(ang) * rad, y = r.cy + Math.sin(ang) * rad;
      const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
      if (tx < 3 || ty < 2 || tx >= w.map.cols - 3 || ty >= w.map.rows - 2) continue;
      // World generation may flatten rock and drain water for the neutrals' homes.
      for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 2; xx <= tx + 2; xx++) w.map.tiles[yy * w.map.cols + xx] = 0;
      if (canPlaceSettlement(w, tx, ty) === null) { placeSettlement(w, n, x, y, tier, true); placed = true; }
    }
    if (placed) k++;
  }
  ns.gold = 0;
}

export function mkNeutralSlot(w: World): Slot {
  return {
    ally: 99, race: 'horde', diff: w.diff, alive: true, gold: 0, settlements: [], ai: false, aiT: 0, aiWant: null, aiLast: 0, queue: [], rally: null, prefer: {}, mat: 0, neutral: true,
    attitude: w.slots.map(() => -100), truce: w.slots.map(() => false), truceT: w.slots.map(() => 0), pact: w.slots.map(() => false), raidT: 0, powerCd: {}, age: 0, tech: { melee: 0, ranged: 0, armor: 0, vehicle: 0, naval: 0, farming: 0, masonry: 0 },
  };
}
