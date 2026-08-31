// Conquest: one continuous world split into regions you claim by settling and keep by holding.
// The slice: 9 regions, one rival, villages and fortresses, upkeep, connection, garrison.

import { BLD } from '../data/buildings.ts';
import { TYPES } from '../data/units.ts';
import { canPlaceSettlement } from './buildings.ts';
import { TILE, type MapDef } from './map.ts';
import { rand, type Rng } from './rng.ts';
import type { Region, Settlement, Tier, World } from './types.ts';
import { allied, say } from './world.ts';

export const REGION_NAMES = ['Ashford', 'Brine', 'Coldwater', 'Dunmere', 'Elsmoor', 'Fallow', 'Greyholm', 'Hollin', 'Ironmark', 'Kestrel', 'Larkspur', 'Marrow', 'Northam', 'Oakhurst', 'Pale Reach', 'Quarry Hill'];

export const CLAIM_SECONDS = 30;
export const WEAK_CLAIM_SECONDS = 10;

export const TIERS: Record<Tier, { cost: number; hp: number; buildT: number; income: number; upkeep: number; garrisonMul: number }> = {
  village: { cost: 150, hp: 300, buildT: 20, income: 2, upkeep: 0.3, garrisonMul: 1 },
  fortress: { cost: 300, hp: 600, buildT: 45, income: 3, upkeep: 0.6, garrisonMul: 0.5 },
};

/** Split the map into a 3x3 of irregular regions: jittered seeds, tiles go to the nearest seed. */
export function makeRegions(m: MapDef, rng: Rng, grid = 3): { regions: Region[]; regionOf: Uint8Array } {
  const seeds: { x: number; y: number }[] = [];
  const cw = m.cols / grid, ch = m.rows / grid;
  for (let gy = 0; gy < grid; gy++)
    for (let gx = 0; gx < grid; gx++)
      seeds.push({ x: (gx + 0.5) * cw + (rand(rng) - 0.5) * cw * 0.4, y: (gy + 0.5) * ch + (rand(rng) - 0.5) * ch * 0.4 });
  const regionOf = new Uint8Array(m.cols * m.rows);
  for (let ty = 0; ty < m.rows; ty++)
    for (let tx = 0; tx < m.cols; tx++) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const d = (tx + 0.5 - seeds[i].x) ** 2 + (ty + 0.5 - seeds[i].y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      regionOf[ty * m.cols + tx] = best;
    }
  const regions: Region[] = seeds.map((sd, i) => ({
    id: i, name: REGION_NAMES[i % REGION_NAMES.length], cx: Math.round(sd.x * TILE), cy: Math.round(sd.y * TILE), adj: [],
    owner: -1, claimant: -1, claimT: 0, contested: false, connected: true, garrison: 0, need: 0,
  }));
  // Adjacency from shared tile edges.
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

export function settlementsIn(w: World, region: number): Settlement[] {
  const out: Settlement[] = [];
  for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0 && b.region === region) out.push(b);
  return out;
}

/** Why a village cannot go here, or null. */
export function canSettle(w: World, slot: number, x: number, y: number): string | null {
  const r = regionAt(w, x, y);
  if (r < 0) return 'not a conquest world';
  const tx = (x / TILE) | 0, ty = (y / TILE) | 0;
  const why = canPlaceSettlement(w, tx, ty);
  if (why) return why;
  const here = settlementsIn(w, r);
  if (here.some((b) => b.team === slot)) return 'you already hold a settlement here';
  if (here.some((b) => !allied(w, b.team, slot))) return 'the enemy holds this region';
  const reg = w.regions[r];
  if (reg.owner >= 0 && !allied(w, reg.owner, slot)) return 'enemy territory, take it first';
  // Must touch your land: adjacent to a region you own, or your capital region.
  const ownAdj = reg.owner === slot || reg.adj.some((a) => w.regions[a].owner === slot);
  if (!ownAdj) return 'not next to your territory';
  return null;
}

export function placeSettlement(w: World, slot: number, x: number, y: number, tier: Tier, instant = false): Settlement {
  const T = TIERS[tier];
  const b: Settlement = { ent: 'base', id: w.nextId++, team: slot, x: ((x / TILE) | 0) * TILE + 4, y: ((y / TILE) | 0) * TILE + 4, hp: instant ? T.hp : Math.round(T.hp * 0.3), max: T.hp, cd: 0, tier, region: regionAt(w, x, y), buildT: instant ? 0 : T.buildT };
  w.slots[slot].settlements.push(b);
  return b;
}

/** Start an in-place upgrade. The settlement keeps its hp fraction, loses production until done. */
export function startUpgrade(b: Settlement): void {
  const frac = b.hp / b.max;
  b.tier = 'fortress';
  b.max = TIERS.fortress.hp;
  b.hp = Math.max(1, Math.round(b.max * frac * 0.6));
  b.buildT = TIERS.fortress.buildT;
}

/** Gold per second a slot pays for what it fields. */
export function upkeepRate(w: World, slot: number): number {
  let u = 0;
  for (const x of w.units) if (x.team === slot && x.hp > 0) u += TYPES[x.type].cost / 100;
  for (const b of w.blds) if (b.team === slot && b.kind === 'tower') u += BLD[b.type].cost / 400;
  for (const b of w.slots[slot].settlements) if (b.hp > 0) u += TIERS[b.tier].upkeep;
  return u;
}

/** Gross income: 2 base, plus each connected working settlement, plus mines. */
export function grossIncome(w: World, slot: number, mcount: number[]): number {
  let g = 2 + 1.5 * mcount[slot];
  for (const b of w.slots[slot].settlements) {
    if (b.hp <= 0 || b.buildT > 0) continue;
    const r = w.regions[b.region];
    if (r && w.rules.connection && !r.connected) continue;
    let inc = TIERS[b.tier].income;
    if (r && w.rules.garrison && r.garrison < r.need) inc *= 0.5;
    g += inc;
  }
  return g;
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

/** Claims, contests, connection, garrison, upkeep, desertion, and the win check. Once per tick. */
export function conquestTick(w: World, dt: number, mcount: number[]): void {
  const byRegion = ownValueByRegion(w);
  const allyOf = w.slots.map((s) => s.ally);
  // Claims and contests.
  for (const r of w.regions) {
    const here = settlementsIn(w, r.id);
    const teams = new Set(here.map((b) => allyOf[b.team]));
    let hostilePresent = false;
    r.claimant = -1;
    if (teams.size === 1) {
      const owner = here[0].team;
      r.claimant = owner;
      for (const s of w.slots) if (s.ally !== allyOf[owner] && (byRegion.get(s.ally + ':' + r.id) ?? 0) > 0) hostilePresent = true;
      r.contested = hostilePresent;
      if (r.owner === owner) r.claimT = 0;
      else if (!hostilePresent) {
        r.claimT += dt;
        if (r.claimT >= CLAIM_SECONDS) {
          r.owner = owner;
          r.claimT = 0;
          if (owner === 0) say(w, r.name + ' is yours', 2.5);
          else if (w.regions.some((q) => q.owner === 0)) say(w, r.name + ' has fallen to the enemy', 2.5);
        }
      } else r.claimT = 0;
    } else {
      r.contested = teams.size > 1;
      if (r.owner >= 0) {
        // No settlement of the owner's side: hostiles holding the ground push it to neutral.
        let hostile = 0;
        for (const s of w.slots) if (s.ally !== allyOf[r.owner] && (byRegion.get(s.ally + ':' + r.id) ?? 0) > 0) hostile++;
        const ownHere = byRegion.get(allyOf[r.owner] + ':' + r.id) ?? 0;
        if (hostile && ownHere === 0 && !here.some((b) => allyOf[b.team] === allyOf[r.owner])) {
          r.claimT += dt;
          const limit = w.rules.garrison && r.garrison < r.need ? WEAK_CLAIM_SECONDS : CLAIM_SECONDS;
          if (r.claimT >= limit) { if (r.owner === 0) say(w, r.name + ' lost', 2.5); r.owner = -1; r.claimT = 0; }
        } else r.claimT = 0;
      } else r.claimT = 0;
    }
  }
  // Garrison requirement.
  for (const r of w.regions) {
    if (r.owner < 0) { r.garrison = 0; r.need = 0; continue; }
    r.garrison = byRegion.get(allyOf[r.owner] + ':' + r.id) ?? 0;
    let hostileAdj = 0;
    for (const a of r.adj) { const o = w.regions[a].owner; if (o >= 0 && allyOf[o] !== allyOf[r.owner]) hostileAdj++; }
    let need = 40 + 60 * hostileAdj;
    const fortNear = settlementsIn(w, r.id).some((b) => b.tier === 'fortress' && b.buildT <= 0 && b.team === r.owner)
      || r.adj.some((a) => settlementsIn(w, a).some((b) => b.tier === 'fortress' && b.buildT <= 0 && b.team === r.owner));
    if (fortNear) need *= 0.5;
    r.need = w.rules.garrison ? need : 0;
  }
  // Connection: every region must trace own-owned regions back to the capital.
  for (let i = 0; i < w.nP; i++) {
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
    for (const r of w.regions) if (r.owner === i) r.connected = !w.rules.connection || seen.has(r.id);
  }
  // Construction and upgrades.
  for (const s of w.slots) for (const b of s.settlements) if (b.hp > 0 && b.buildT > 0) { b.buildT -= dt; if (b.buildT <= 0) { b.buildT = 0; if (b.team === 0) say(w, (b.tier === 'fortress' ? 'Fortress' : 'Village') + ' finished in ' + w.regions[b.region].name, 2); } }
  // Income minus upkeep, then desertion when broke.
  for (let i = 0; i < w.nP; i++) {
    const s = w.slots[i];
    if (!s.alive) continue;
    const net = grossIncome(w, i, mcount) - (w.rules.upkeep ? upkeepRate(w, i) : 0);
    w.net[i] = net;
    s.gold += net * dt;
    if (s.gold < 0) {
      s.gold = 0;
      w.broke[i] += dt;
      if (w.broke[i] >= 8) {
        w.broke[i] = 0;
        let worst = null as import('./types.ts').Unit | null;
        for (const u of w.units) if (u.team === i && u.hp > 0 && (!worst || TYPES[u.type].cost > TYPES[worst.type].cost)) worst = u;
        if (worst) { worst.hp = 0; if (i === 0) say(w, TYPES[worst.type].name + ' deserted. You cannot pay the army.', 3); }
      }
    } else w.broke[i] = 0;
  }
  // Win: hold every rival capital. Loss: no settlements, handled by elim.
  if (!w.over) {
    let rivals = 0, taken = 0;
    for (let i = 1; i < w.nP; i++) {
      if (allied(w, 0, i)) continue;
      rivals++;
      const cap = w.capitals[i];
      if (cap >= 0 && w.regions[cap].owner >= 0 && allied(w, w.regions[cap].owner, 0)) taken++;
    }
    if (rivals && taken === rivals) { w.over = 'win'; say(w, 'Every rival capital is yours', 3); }
  }
}

/** Region ownership as a sortable list for the HUD and the territory list. */
export function heldRegions(w: World, slot: number): Region[] {
  return w.regions.filter((r) => r.owner === slot);
}

