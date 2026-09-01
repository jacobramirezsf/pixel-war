// The town layer: placed buildings with footprints, construction, per-building training,
// ages that follow your best settlement, and blacksmith research. Gold only.

import { BLD, trainerFor, type BldKey } from '../data/buildings.ts';
import { TYPES, type UnitKey } from '../data/units.ts';
import { TIER_AGE } from './conquest.ts';
import { PROFILES } from './ai/profiles.ts';
import { TEAM } from '../data/teams.ts';
import { addBld, canBuild, passableFor } from './buildings.ts';
import { rnd } from './rng.ts';
import type { Building, Tech, Unit, World } from './types.ts';
import { say } from './world.ts';
import { mkUnit } from './units.ts';
import { wonderDone } from './wonder.ts';

export const RESEARCH_COST = [120, 240];
export const TECH_NAMES: Record<Tech, string> = { melee: 'BLADES', ranged: 'BOWS', armor: 'ARMOR' };

/** The age a faction plays at: its best finished settlement. Without the ages rule, everything is open. */
export function ageOf(w: World, slot: number): number {
  if (!w.rules.ages) return 2;
  let a = 0;
  for (const b of w.slots[slot].settlements) if (b.hp > 0 && b.buildT <= 0) a = Math.max(a, TIER_AGE[b.tier]);
  return a;
}

/** Finished buildings of a type owned by a slot. */
export function ownBlds(w: World, slot: number, type?: BldKey): Building[] {
  return w.blds.filter((b) => b.team === slot && b.buildT <= 0 && (!type || b.type === type));
}

/** Where a unit trains in town mode: a building type, or null for the settlement. */
export function trainerType(unit: UnitKey): BldKey | null {
  const T = TYPES[unit];
  if (T.repair || T.role === 'scout') return null;
  return trainerFor(T.role);
}

/** Why a unit cannot be trained now, or null. */
export function canTrain(w: World, slot: number, unit: UnitKey): string | null {
  if (!w.rules.town) return null;
  const t = trainerType(unit);
  if (!t) return null;
  if (!ownBlds(w, slot, t).length) return 'needs a ' + BLD[t].name.toLowerCase();
  return null;
}

/** The trainer with the shortest queue, or null when the settlement trains it. */
export function pickTrainer(w: World, slot: number, unit: UnitKey): Building | null {
  const t = trainerType(unit);
  if (!t || !w.rules.town) return null;
  const list = ownBlds(w, slot, t);
  if (!list.length) return null;
  return list.reduce((a, b) => (b.queue.length < a.queue.length ? b : a));
}

export function canResearch(w: World, slot: number, tech: Tech): string | null {
  if (!w.rules.town) return 'not in this mode';
  if (!ownBlds(w, slot, 'smith').length) return 'needs a blacksmith';
  const lvl = w.slots[slot].tech[tech];
  if (lvl >= RESEARCH_COST.length) return 'already at the top';
  if (w.slots[slot].gold < RESEARCH_COST[lvl]) return 'need ' + RESEARCH_COST[lvl] + ' gold';
  return null;
}

/** Population from settlements, houses, and castles. */
export function townPop(w: World, slot: number): number {
  let p = 0;
  for (const b of w.blds) if (b.team === slot && b.buildT <= 0 && BLD[b.type].pop) p += BLD[b.type].pop!;
  return p;
}

/** Gold per second from farms and markets that stand within reach of a working settlement. */
export function townIncome(w: World, slot: number): number {
  let g = 0;
  const homes = w.slots[slot].settlements.filter((s) => s.hp > 0 && s.buildT <= 0);
  for (const b of w.blds) {
    if (b.team !== slot || b.buildT > 0) continue;
    const inc = BLD[b.type].income;
    if (!inc) continue;
    if (b.type === 'farm' && !homes.some((s) => Math.hypot(s.x - b.x, s.y - b.y) < 72)) continue;
    g += inc;
  }
  return g;
}

/** A finished castle near a point calms and guards like the old fortress did. */
export function castleNear(w: World, slot: number, x: number, y: number, r = 96): boolean {
  return w.blds.some((b) => b.team === slot && b.type === 'castle' && b.buildT <= 0 && Math.hypot(b.x - x, b.y - y) < r);
}

/** Spawn beside a building, on the side facing the map center. */
function spawnAt(w: World, b: Building, unit: UnitKey): Unit | null {
  const D = BLD[b.type];
  const cx = (w.map.cols * 8) / 2, cy = (w.map.rows * 8) / 2;
  const dx = Math.sign(cx - b.x) || 1, dy = Math.sign(cy - b.y) || 1;
  const rx = (D.w * 8) / 2 + 6, ry = (D.h * 8) / 2 + 6;
  const tries: [number, number][] = [[b.x, b.y + dy * ry], [b.x + dx * rx, b.y], [b.x + dx * rx, b.y + dy * ry], [b.x - dx * rx, b.y], [b.x, b.y - dy * ry]];
  for (const [x, y] of tries) {
    const px = x + rnd(w.rng, -3, 3), py = y + rnd(w.rng, -3, 3);
    if (passableFor(w, b.team, px, py)) { const u = mkUnit(w, b.team, unit, px, py); w.units.push(u); return u; }
  }
  return null;
}

/** Construction, per-building production, and age sync. Once per tick. */
export function townTick(w: World, dt: number): void {
  if (!w.rules.town) return;
  for (let i = 0; i < w.nP; i++) w.slots[i].age = ageOf(w, i);
  for (const b of w.blds) {
    if (b.buildT > 0) {
      // Workers within reach double the pace.
      let helpers = 0;
      for (const u of w.units) if (u.team === b.team && u.hp > 0 && TYPES[u.type].repair && Math.hypot(u.x - b.x, u.y - b.y) < 28) helpers++;
      const total = BLD[b.type].buildT ?? 1;
      const rate = (w.cheats.build ? 1e9 : 1) * (1 + Math.min(2, helpers));
      b.buildT = Math.max(0, b.buildT - dt * rate);
      b.hp = Math.min(b.max, Math.max(b.hp, Math.round(b.max * (0.1 + 0.9 * (1 - b.buildT / total)))));
      if (b.buildT <= 0) { if (b.team === 0) say(w, BLD[b.type].name + ' finished', 1.5); wonderDone(w, b); }
      continue;
    }
    if (!b.queue.length || b.hp <= 0) continue;
    const s = w.slots[b.team];
    const q = b.queue[0];
    const rate = (s.ai ? PROFILES[s.diff].build : 1) * (w.instant || w.cheats.instant ? 1e9 : 1);
    q.t -= dt * rate;
    if (q.t > 0) continue;
    const u = spawnAt(w, b, q.unit);
    if (!u) { q.t = 0.5; continue; }
    b.queue.shift();
    u.held = q.held;
    const rally = b.rally ?? s.rally;
    if (rally && !q.held) u.order = { type: 'move', x: rally.x, y: rally.y };
    if (b.team === 0) w.fx.push({ k: 'txt', x: u.x, y: u.y - 8, t: 0.9, str: TYPES[q.unit].name, c: TEAM[b.team] });
  }
}

/** Try to place a building somewhere around a point. Returns the building, or null. */
export function findSpot(w: World, slot: number, type: BldKey, x: number, y: number, maxRing = 9): { tx: number; ty: number } | null {
  const D = BLD[type];
  const cx = (w.map.cols * 8) / 2, cy = (w.map.rows * 8) / 2;
  const toward = Math.atan2(cy - y, cx - x);
  for (let ring = 2; ring <= maxRing; ring++)
    for (let k = 0; k < 12; k++) {
      // Sweep from the side facing the map center outward.
      const ang = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      const px = x + Math.cos(ang) * ring * 8, py = y + Math.sin(ang) * ring * 8;
      const tx = Math.round(px / 8 - D.w / 2), ty = Math.round(py / 8 - D.h / 2);
      if (!canBuild(w, tx, ty, slot, type)) return { tx, ty };
    }
  return null;
}

/** Starting buildings beside a slot's base, finished at once. */
export function prebuildTown(w: World, slot: number, types: BldKey[] = ['barracks', 'range']): void {
  const b = w.slots[slot].settlements[0];
  if (!b) return;
  const saveAge = w.slots[slot].age;
  w.slots[slot].age = 2;
  for (const t of types) {
    const spot = findSpot(w, slot, t, b.x, b.y, 12);
    if (spot) addBld(w, slot, t, spot.tx, spot.ty);
  }
  w.slots[slot].age = saveAge;
}

/** Queued units across the settlement and every training building. */
export function queuedCount(w: World, slot: number): number {
  let n = w.slots[slot].queue.length;
  for (const b of w.blds) if (b.team === slot) n += b.queue.length;
  return n;
}

