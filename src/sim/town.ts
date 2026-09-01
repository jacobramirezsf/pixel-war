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
import { allied, cheat, inZone, say } from './world.ts';
import { mkUnit } from './units.ts';
import { wonderDone } from './wonder.ts';

export const RESEARCH_COST = [120, 240, 420];
export const TECH_NAMES: Record<Tech, string> = { melee: 'BLADES', ranged: 'BOWS', armor: 'ARMOR', vehicle: 'ENGINES', naval: 'HULLS', farming: 'FARMING', masonry: 'MASONRY' };
/** What each research does, in plain words, and where it is bought. */
export const TECH_INFO: Record<Tech, { levels: number; at: BldKey; text: string; age?: number }> = {
  melee:   { levels: 3, at: 'smith',  text: 'melee damage +1 a level' },
  ranged:  { levels: 3, at: 'smith',  text: 'ranged damage +1 a level' },
  armor:   { levels: 3, at: 'smith',  text: 'every unit takes 1 less a level' },
  vehicle: { levels: 2, at: 'factory', text: 'vehicles and aircraft +15% damage a level', age: 2 },
  naval:   { levels: 2, at: 'dock',   text: 'boats +20% damage a level', age: 1 },
  farming: { levels: 2, at: 'market', text: 'farm and market jobs pay 25% more a level', age: 1 },
  masonry: { levels: 2, at: 'market', text: 'new walls and towers +25% health, builds 20% faster a level', age: 1 },
};
export const TECH_KEYS = Object.keys(TECH_INFO) as Tech[];
/** Building levels: cost is the base times the level, training speeds up, queues lengthen. */
export const LEVEL_MAX = 3;
export const levelSpeed = (level: number): number => 1 + 0.25 * (level - 1);
export const levelQueue = (level: number): number => 12 + 4 * (level - 1);

/** The age a faction plays at: its best finished settlement. Without the ages rule, everything is open. */
export function ageOf(w: World, slot: number): number {
  if (cheat(w, slot, 'allAges')) return 2;
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
  if (T.trainer) return T.trainer;
  if (T.repair || T.role === 'scout') return null;
  return trainerFor(T.role);
}

/** Why a unit cannot be trained now, or null. */
export function canTrain(w: World, slot: number, unit: UnitKey): string | null {
  if (!w.rules.town) return null;
  const t = trainerType(unit);
  if (!t) return null;
  if (!ownBlds(w, slot, t).length && !(t === 'dock' && ownBlds(w, slot, 'port').length)) return 'needs a ' + BLD[t].name.toLowerCase();
  return null;
}

/**
 * Which building trains this unit. A named building wins when it can. Then the slot's default
 * for the role. Then the one nearest a named settlement. Then the shortest queue. Null when
 * the settlement itself trains it.
 */
export function pickTrainer(w: World, slot: number, unit: UnitKey, building?: number, near?: number): Building | null {
  const t = trainerType(unit);
  if (!t || !w.rules.town) return null;
  const list = t === 'dock' ? [...ownBlds(w, slot, 'dock'), ...ownBlds(w, slot, 'port')] : ownBlds(w, slot, t);
  if (!list.length) return null;
  if (building != null) { const b = list.find((x) => x.id === building); if (b) return b; }
  const pref = w.slots[slot].prefer[TYPES[unit].role];
  if (pref != null) { const b = list.find((x) => x.id === pref); if (b && b.queue.length < 12) return b; }
  if (near != null) {
    const home = w.slots[slot].settlements.find((x) => x.id === near);
    if (home) return list.reduce((a, b) => (Math.hypot(b.x - home.x, b.y - home.y) < Math.hypot(a.x - home.x, a.y - home.y) ? b : a));
  }
  return list.reduce((a, b) => (b.queue.length < a.queue.length ? b : a));
}

export function canResearch(w: World, slot: number, tech: Tech): string | null {
  if (!w.rules.town) return 'not in this mode';
  const I = TECH_INFO[tech];
  if (!ownBlds(w, slot, I.at).length) return 'needs a ' + BLD[I.at].name.toLowerCase();
  if ((I.age ?? 0) > ageOf(w, slot)) return 'needs the ' + ['village', 'town', 'city'][I.age ?? 0] + ' age';
  const lvl = w.slots[slot].tech[tech];
  if (lvl >= I.levels) return 'already at the top';
  if (lvl >= 2 && ageOf(w, slot) < 2) return 'level 3 needs a city';
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

function hostileNear(w: World, team: number, x: number, y: number, r: number): boolean {
  for (const u of w.units) if (u.hp > 0 && !allied(w, u.team, team) && TYPES[u.type].dmg > 0 && Math.hypot(u.x - x, u.y - y) < r) return true;
  return false;
}

/**
 * Spawn beside a building, on the side facing the map center. When enemies stand at that door,
 * recruits muster at the hall instead of walking out one at a time into them.
 */
function spawnAt(w: World, b: Building, unit: UnitKey): Unit | null {
  const D = BLD[b.type];
  const cx = (w.map.cols * 8) / 2, cy = (w.map.rows * 8) / 2;
  const dx = Math.sign(cx - b.x) || 1, dy = Math.sign(cy - b.y) || 1;
  const rx = (D.w * 8) / 2 + 6, ry = (D.h * 8) / 2 + 6;
  let tries: [number, number][] = [[b.x, b.y + dy * ry], [b.x + dx * rx, b.y], [b.x + dx * rx, b.y + dy * ry], [b.x - dx * rx, b.y], [b.x, b.y - dy * ry]];
  const home = w.slots[b.team].settlements.find((h) => h.hp > 0);
  if (home && hostileNear(w, b.team, tries[0][0], tries[0][1], 30) && !hostileNear(w, b.team, home.x, home.y, 30)) {
    const hx = Math.sign(cx - home.x) || 1, hy = Math.sign(cy - home.y) || 1;
    tries = [[home.x, home.y + hy * 14], [home.x + hx * 18, home.y], [home.x - hx * 18, home.y], [home.x, home.y - hy * 14]];
  }
  const T = TYPES[unit];
  const medium = T.naval ? 'sea' : T.fly ? 'air' : 'ground';
  if (T.naval) {
    // Boats launch onto the water beside the dock.
    const m = w.map;
    for (let ring = 1; ring <= 4; ring++)
      for (let dy = -ring; dy <= ring; dy++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const tx = Math.round(b.x / 8) + dx, ty = Math.round(b.y / 8) + dy;
          if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows || m.tiles[ty * m.cols + tx] !== 3) continue;
          const u = mkUnit(w, b.team, unit, tx * 8 + 4, ty * 8 + 4); w.units.push(u); return u;
        }
    return null;
  }
  for (const [x, y] of tries) {
    const px = x + rnd(w.rng, -3, 3), py = y + rnd(w.rng, -3, 3);
    if (passableFor(w, b.team, px, py, medium)) { const u = mkUnit(w, b.team, unit, px, py); w.units.push(u); return u; }
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
      // Workers double the pace; villagers who came to help count half each. A raid at the door halves it.
      let helpers = 0;
      for (const u of w.units) if (u.team === b.team && u.hp > 0 && Math.hypot(u.x - b.x, u.y - b.y) < 28) { if (TYPES[u.type].repair) helpers += 1; else if (TYPES[u.type].role === 'civ' && u.job === -2) helpers += 0.5; }
      const total = BLD[b.type].buildT ?? 1;
      const D = BLD[b.type];
      const mason = (D.kind === 'wall' || D.kind === 'tower' || D.kind === 'gate') ? 1 + 0.2 * (w.slots[b.team].tech.masonry ?? 0) : 1;
      const raided = w.slots[b.team].settlements.some((st) => st.hp > 0 && st.civ.state === 'attacked' && Math.hypot(st.x - b.x, st.y - b.y) < 110);
      const rate = (cheat(w, b.team, 'build') ? 1e9 : 1) * (1 + Math.min(2, helpers)) * mason * (raided ? 0.5 : 1) * (inZone(w, b.team, 'golden', b.x, b.y) ? 1.5 : 1);
      b.buildT = Math.max(0, b.buildT - dt * rate);
      b.hp = Math.min(b.max, Math.max(b.hp, Math.round(b.max * (0.1 + 0.9 * (1 - b.buildT / total)))));
      if (b.buildT <= 0) { if (b.team === 0) say(w, BLD[b.type].name + ' finished', 1.5); wonderDone(w, b); }
      continue;
    }
    if (!b.queue.length || b.hp <= 0) continue;
    const s = w.slots[b.team];
    const q = b.queue[0];
    const rate = (s.ai ? PROFILES[s.diff].build : 1) * levelSpeed(b.level) * (w.instant || cheat(w, b.team, 'instant') ? 1e9 : 1);
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


/** Why this building cannot go up a level, or null. Walls and towers step to the next material instead. */
export function canUpgradeBld(w: World, slot: number, b: Building): string | null {
  if (b.team !== slot) return 'not yours';
  if (b.buildT > 0) return 'still building';
  const next = nextType(b.type);
  if (next) {
    const D = BLD[next];
    if ((D.age ?? 0) > ageOf(w, slot)) return 'needs the ' + ['village', 'town', 'city'][D.age ?? 0] + ' age';
    return null;
  }
  if (!BLD[b.type].trains) return 'nothing to upgrade';
  if (b.level >= LEVEL_MAX) return 'already level ' + LEVEL_MAX;
  if (b.level >= 2 && ageOf(w, slot) < 2) return 'level 3 needs a city';
  return null;
}

/** Palisade to stone to steel; wood tower to stone tower to turret. */
export function nextType(type: BldKey): BldKey | null {
  const chain: Partial<Record<BldKey, BldKey>> = { stk: 'wal', wal: 'stw', twr: 'stt', stt: 'trt' };
  return chain[type] ?? null;
}

export function upgradeCost(b: Building): { gold: number; mat: number } {
  const next = nextType(b.type);
  if (next) { const D = BLD[next], O = BLD[b.type]; return { gold: 0, mat: Math.max(5, (D.cost - O.cost)) }; }
  const D = BLD[b.type];
  return { gold: D.cost * b.level, mat: Math.round((D.mat ?? 0) * 0.5 * b.level) };
}

/** Wall or tower segments of the same type touching this one, this one included. */
export function connectedSegments(w: World, b: Building): Building[] {
  const out: Building[] = [b];
  const seen = new Set([b.id]);
  const stack = [b];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const [tx, ty] of cur.tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = w.bmap.get((ty + dy) * w.map.cols + tx + dx);
      if (o && !seen.has(o.id) && o.team === b.team && o.type === b.type) { seen.add(o.id); out.push(o); stack.push(o); }
    }
  }
  return out;
}
