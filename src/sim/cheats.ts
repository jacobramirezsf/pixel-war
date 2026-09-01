// One-shot cheats. Toys for sandbox play and testing. Every one is a command, so replays keep them.

import { BLD, type BldKey } from '../data/buildings.ts';
import { EXTRA_UNITS, roster, TYPES, type Role, type UnitKey } from '../data/units.ts';
import { addBld, canBuild, passableFor, removeBld } from './buildings.ts';
import { seedResidents } from './civ.ts';
import { damage } from './combat.ts';
import { canSettle, placeSettlement, raidOrigin, regionAt, setTruce, spawnRaiders, startUpgrade, nameRegionFor, settlementsIn } from './conquest.ts';
import { findSpot } from './town.ts';
import type { Action, World } from './types.ts';
import { mkUnit } from './units.ts';
import { allied } from './world.ts';

type Payload = Extract<Action, { type: 'cheat' }>['payload'];

const ARMIES: Record<'small' | 'large' | 'siege' | 'elite' | 'navy' | 'air' | 'darpa', Partial<Record<Role, number>>> = {
  small: { line: 6, ranged: 3 },
  large: { line: 12, ranged: 6, fast: 3, heavy: 2 },
  siege: { line: 8, ranged: 4, siege: 3 },
  elite: { heavy: 3, special: 3, support: 2 },
  navy: { naval: 6 },
  air: { air: 4, darpa: 4 },
  darpa: { darpa: 10, robot: 3 },
};

function pick(race: import('../data/races.ts').RaceKey, role: Role, i: number): UnitKey | null {
  const pool = role === 'naval' || role === 'vehicle' || role === 'darpa' || role === 'robot' ? EXTRA_UNITS : roster(race);
  let list = pool.filter((k) => TYPES[k].role === role && !TYPES[k].repair && TYPES[k].role !== 'civ');
  if (role === 'air' && !list.length) list = EXTRA_UNITS.filter((k) => TYPES[k].fly && TYPES[k].dmg > 0);
  if (role === 'darpa' && i % 2) list = list.filter((k) => TYPES[k].fly && TYPES[k].dmg > 0);
  if (!list.length) return null;
  return list[i % list.length];
}

/** Drop units of a team around a point on open ground. Returns how many landed. */
export function spawnUnits(w: World, team: number, unit: UnitKey, n: number, x: number, y: number, hostileOrders = false): number {
  let placed = 0;
  for (let i = 0; i < n && i < 200; i++) {
    for (let k = 0; k < (TYPES[unit].naval ? 400 : 80); k++) {
      const a = (i + k) * 2.4, r = 3 + Math.sqrt(i + k) * 4.5;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (px < 4 || py < 4 || px > w.map.cols * 8 - 4 || py > w.map.rows * 8 - 4) continue;
      if (!TYPES[unit].fly && !passableFor(w, team, px, py, TYPES[unit].naval ? 'sea' : 'ground')) continue;
      const u = mkUnit(w, team, unit, px, py);
      if (hostileOrders) u.order = { type: 'attack', tgt: null };
      w.units.push(u);
      placed++;
      break;
    }
  }
  return placed;
}

export function spawnArmy(w: World, team: number, kind: keyof typeof ARMIES, x: number, y: number, hostileOrders = false): number {
  const race = w.slots[team].race;
  let placed = 0, i = 0;
  for (const [role, n] of Object.entries(ARMIES[kind]) as [Role, number][]) {
    for (let j = 0; j < n; j++) { const k = pick(race, role, j); if (k) placed += spawnUnits(w, team, k, 1, x + Math.cos(i) * 10, y + Math.sin(i) * 10, hostileOrders); i++; }
  }
  return placed;
}

export function runCheat(w: World, c: Payload, say: (t: string, d: number) => void): boolean {
  const s = w.slots[0];
  const n = Math.max(1, Math.min(200, c.n ?? 1));
  const at = { x: c.x ?? 0, y: c.y ?? 0 };
  switch (c.op) {
    case 'gold': s.gold = Number.isFinite(s.gold) ? s.gold + (c.n ?? 1000) : s.gold; say('+' + (c.n ?? 1000) + ' gold', 1); return true;
    case 'mat': s.mat += c.n ?? 500; say('+' + (c.n ?? 500) + ' materials', 1); return true;
    case 'research': s.tech = { melee: 3, ranged: 3, armor: 3, vehicle: 2, naval: 2, farming: 2, masonry: 2 }; say('Every research done', 1.5); return true;
    case 'heal':
      for (const u of w.units) if (u.team === 0 && u.hp > 0) u.hp = TYPES[u.type].hp;
      for (const b of w.blds) if (b.team === 0) b.hp = b.max;
      for (const b of s.settlements) if (b.hp > 0) b.hp = b.max;
      say('Everything of yours is whole', 1.5); return true;
    case 'revive': {
      const home = s.settlements.find((b) => b.hp > 0);
      if (!home) return false;
      const k = spawnArmy(w, 0, 'large', home.x + 30, home.y + 30);
      say(k + ' soldiers muster at ' + (w.regions[home.region]?.name ?? 'home'), 2); return k > 0;
    }
    case 'finish':
      for (const b of w.blds) if (b.team === 0 && b.buildT > 0) { b.buildT = 0.001; }
      for (const b of s.settlements) if (b.buildT > 0) b.buildT = 0.001;
      say('Every build finishes now', 1.5); return true;
    case 'queues':
      for (const b of w.blds) if (b.team === 0) for (const q of b.queue) q.t = 0;
      for (const q of s.queue) q.t = 0;
      say('Every queue completes now', 1.5); return true;
    case 'clearNear': {
      let k = 0;
      for (const u of w.units) if (u.hp > 0 && !allied(w, u.team, 0) && Math.hypot(u.x - at.x, u.y - at.y) <= (c.n ?? 120)) { u.hp = -1; k++; }
      say(k + ' enemies gone', 1.5); return true;
    }
    case 'clearAll': {
      let k = 0;
      for (const u of w.units) if (u.hp > 0 && !allied(w, u.team, 0) && TYPES[u.type].role !== 'civ') { u.hp = -1; k++; }
      say(k + ' enemy soldiers gone. Their kingdoms stand.', 2); return true;
    }
    case 'destroy': {
      const u = w.units.find((q) => q.id === c.id && q.hp > 0);
      if (u) { damage(w, u, 99999, true); return true; }
      const b = w.blds.find((q) => q.id === c.id);
      if (b) { removeBld(w, b); w.fx.push({ k: 'die', x: b.x, y: b.y, t: 0.35 }); return true; }
      for (const sl of w.slots) for (const q of sl.settlements) if (q.id === c.id && q.hp > 0) { damage(w, q, 99999, true); return true; }
      return false;
    }
    case 'spawn': {
      if (!c.unit || !TYPES[c.unit]) return false;
      const team = c.team ?? 0;
      const k = spawnUnits(w, team, c.unit, n, at.x, at.y, team !== 0 && !allied(w, team, 0));
      say(k + ' ' + TYPES[c.unit].name.toLowerCase() + (k === 1 ? '' : 's'), 1); return k > 0;
    }
    case 'army': {
      const kind = c.kind ?? 'small';
      const team = c.team ?? 0;
      const hostile = team !== 0 && !allied(w, team, 0);
      const k = spawnArmy(w, team, kind, at.x, at.y, hostile);
      say((hostile ? 'Enemy ' : '') + kind + ' army: ' + k + ' units', 1.5); return k > 0;
    }
    case 'raid': {
      if (!w.regionOf) return false;
      const town = s.settlements.find((b) => b.id === c.id && b.hp > 0) ?? s.settlements.find((b) => b.hp > 0);
      if (!town) return false;
      const r = w.regions[town.region];
      const o = raidOrigin(w, r);
      spawnRaiders(w, r, o.x, o.y, c.size === 'large' ? 12 : c.size === 'medium' ? 7 : 4);
      return true;
    }
    case 'bandits': {
      if (w.neutral < 0) return false;
      const list = roster(w.slots[w.neutral].race).filter((k) => TYPES[k].cost <= 45 && !TYPES[k].repair && TYPES[k].role !== 'civ');
      let k = 0;
      for (let i = 0; i < n; i++) k += spawnUnits(w, w.neutral, list[i % list.length], 1, at.x, at.y, true);
      say(k + ' bandits', 1); return k > 0;
    }
    case 'settle': {
      if (!w.regionOf) return false;
      // The point, then a ring around it, until the ground and the neighbors allow.
      let spot: { x: number; y: number } | null = null, why: string | null = null;
      for (let k = 0; k < 9 && !spot; k++) {
        const ang = (k * 2 * Math.PI) / 8, rad = k === 0 ? 0 : 28;
        const px = at.x + Math.cos(ang) * rad, py = at.y + Math.sin(ang) * rad;
        why = canSettle(w, 0, px, py);
        if (!why || why.includes('territory')) spot = { x: px, y: py };
      }
      if (!spot) { say('Cannot settle: ' + why, 1.5); return false; }
      const first = !settlementsIn(w, regionAt(w, spot.x, spot.y)).some((q) => !w.slots[q.team].neutral);
      const b = placeSettlement(w, 0, spot.x, spot.y, 'village', true);
      if (first) nameRegionFor(w, w.regions[b.region], s.race);
      w.regions[b.region].owner = 0;
      w.regions[b.region].claimant = 0;
      seedResidents(w, b, 3);
      w.flowDirty = true;
      say('Founded ' + w.regions[b.region].name, 1.5); return true;
    }
    case 'peace':
      for (let i = 1; i < w.nP; i++) if (!w.slots[i].neutral && !s.truce[i]) setTruce(w, 0, i, true);
      say('Peace everywhere', 1.5); return true;
    case 'totalWar':
      for (let i = 0; i < w.nP; i++) for (let j = i + 1; j < w.nP; j++) if (!w.slots[i].neutral && !w.slots[j].neutral && w.slots[i].truce[j]) setTruce(w, i, j, false);
      say('Everyone is at war', 2); return true;
    case 'rebuild': {
      const town = s.settlements.find((b) => b.id === c.id && b.hp > 0) ?? s.settlements.find((b) => b.hp > 0);
      if (!town) return false;
      town.hp = town.max;
      for (const b of w.blds) if (b.team === 0 && Math.hypot(b.x - town.x, b.y - town.y) < 110) { b.hp = b.max; b.buildT = 0; }
      const people = w.units.filter((u) => u.hp > 0 && u.home === town.id).length;
      if (people < 8) { seedResidents(w, town, 8 - people); town.civ.residents = 8; }
      say(w.regions[town.region]?.name + ' is rebuilt', 1.5); return true;
    }
    case 'maxCity': {
      const town = s.settlements.find((b) => b.id === c.id && b.hp > 0) ?? s.settlements.find((b) => b.hp > 0);
      if (!town || town.tier === 'camp' || town.tier === 'ruin') return false;
      if (town.tier !== 'city') { startUpgrade(town, 'city'); town.buildT = 0; town.hp = town.max; }
      s.age = 2;
      const wants: BldKey[] = ['house', 'house', 'house', 'house', 'farm', 'farm', 'farm', 'market', 'smith', 'barracks', 'range', 'stable'];
      for (const k of wants) {
        const have = w.blds.filter((b) => b.team === 0 && b.type === k && Math.hypot(b.x - town.x, b.y - town.y) < 110).length;
        const need = wants.filter((x) => x === k).length;
        if (have >= need) continue;
        const spot = findSpot(w, 0, k, town.x, town.y, 14);
        if (spot && !canBuild(w, spot.tx, spot.ty, 0, k)) addBld(w, 0, k, spot.tx, spot.ty);
      }
      const people = w.units.filter((u) => u.hp > 0 && u.home === town.id).length;
      if (people < 20) { seedResidents(w, town, 20 - people); town.civ.residents = 20; }
      w.flowDirty = true;
      say(w.regions[town.region]?.name + ' is a city', 2); return true;
    }
  }
  return false;
}

/** Things a cheat can name in the HUD. Kept here so the UI and the sim agree. */
export const CHEAT_BLD: readonly BldKey[] = Object.keys(BLD) as BldKey[];
