// What to do. Assess the faction's holdings and army, then pick one behavior per decision.
// Written against a list of settlements from the start; Skirmish passes a list of one.

import { BLD } from '../../data/buildings.ts';
import { DIFF } from '../../data/difficulty.ts';
import { roster, TYPES, type UnitKey } from '../../data/units.ts';
import { addBld, canBuild } from '../buildings.ts';
import { applyCommand, cmd } from '../commands.ts';
import { rand } from '../rng.ts';
import type { Settlement, Unit, World } from '../types.ts';
import { allied, slotDiff } from '../world.ts';
import { canSettle, TIERS } from '../conquest.ts';
import { pickUnit, roleMix } from './composition.ts';
import { PROFILES, type AiProfile } from './profiles.ts';
import { hostileValueNear, mineTargets, moveTo, nearestHostileBase, order, ownValueNear, pullBack, rallyPoint } from './tactics.ts';

export interface Assessment {
  own: Unit[];
  ownValue: number;
  enemy: Unit[];
  enemyValue: number;
  /** Own settlement under the most pressure, and the hostile value near it. */
  threatAt: Settlement | null;
  threat: number;
  /** Units waiting at the rally point. */
  held: Unit[];
  gold: number;
  income: number;
}

export function assess(w: World, slot: number): Assessment {
  const own: Unit[] = [], enemy: Unit[] = [];
  let ownValue = 0, enemyValue = 0;
  for (const u of w.units) {
    if (u.hp <= 0) continue;
    if (u.team === slot) { own.push(u); ownValue += TYPES[u.type].cost; }
    else if (!allied(w, u.team, slot)) { enemy.push(u); enemyValue += TYPES[u.type].cost; }
  }
  let threatAt: Settlement | null = null, threat = 0;
  for (const b of w.slots[slot].settlements) {
    if (b.hp <= 0) continue;
    const v = hostileValueNear(w, slot, b.x, b.y, 64);
    if (v > threat) { threat = v; threatAt = b; }
  }
  const held = own.filter((u) => u.held);
  const s = w.slots[slot];
  return { own, ownValue, enemy, enemyValue, threatAt, threat, held, gold: s.gold, income: 0 };
}

const isFast = (u: Unit): boolean => { const r = TYPES[u.type].role; return r === 'fast' || r === 'scout' || r === 'air'; };

/** Buy units and, when the profile allows, a worker or a tower. Bought units wait at the rally point. */
function shop(w: World, slot: number, a: Assessment, P: AiProfile): void {
  const s = w.slots[slot], race = s.race;
  const enemyMix = roleMix(a.enemy);
  const damaged = w.blds.some((b) => b.team === slot && b.hp < b.max * 0.7);
  const worker = roster(race).find((k) => !!TYPES[k].repair);
  if (P.builds && worker && damaged && !a.own.some((u) => TYPES[u.type].repair) && s.gold >= TYPES[worker].cost + 20) {
    buy(w, slot, worker, true);
    return;
  }
  if (P.builds && s.gold >= BLD[slotDiff(w, slot).twr].cost + 80 && (a.threat > 0 || rand(w.rng) < 0.15)) {
    const T = slotDiff(w, slot).twr, mb = w.map.bases[slot];
    for (let k = 0; k < 12; k++) {
      const tx = mb.tx + ((rand(w.rng) * 11) | 0) - 5, ty = mb.ty + ((rand(w.rng) * 7) | 0) - 3;
      if (!canBuild(w, tx, ty, slot, T)) { addBld(w, slot, T, tx, ty); s.gold -= BLD[T].cost; break; }
    }
  }
  // Opening: the first two units are the cheapest fast things on the roster, bound for the mines.
  if (w.t < 25 && a.own.length + s.queue.length < 2 && w.mines.length) {
    const cheap = roster(race).filter((k) => !TYPES[k].repair && TYPES[k].speed >= 28).sort((x, y) => TYPES[x].cost - TYPES[y].cost)[0] ?? roster(race)[0];
    if (s.gold >= TYPES[cheap].cost) buy(w, slot, cheap, true);
    return;
  }
  // Spend down to a small reserve. Several purchases per decision when the treasury allows.
  const home = s.settlements.find((b) => b.hp > 0);
  const tgt = home ? nearestHostileBase(w, slot, home.x, home.y) : null;
  const fortified = !!tgt && w.blds.filter((b) => b.kind === 'tower' && !allied(w, b.team, slot) && Math.hypot(b.x - tgt.x, b.y - tgt.y) < 60).length >= 2;
  // Queue a few ahead, never more: gold in the queue cannot answer a raid.
  for (let n = 0; n < 4 && s.queue.length < 3; n++) {
    const k = pickUnit(w.rng, race, w.t, s.gold, enemyMix, P.counter, () => false, fortified);
    if (!k || s.gold < TYPES[k].cost) break;
    if (!buy(w, slot, k, true)) break;
  }
}

function buy(w: World, slot: number, unit: UnitKey, held: boolean): boolean {
  return applyCommand(w, cmd(w, slot, { type: 'buy', payload: { unit, held } }), true);
}

function settleCandidates(w: World, slot: number): import('../types.ts').Region[] {
  return w.regions.filter((r) => r.owner < 0 && r.adj.some((x) => w.regions[x].owner === slot));
}

/** Conquest: with a free region next door and a standing army, hold gold back for a village. */
function savingForLand(w: World, slot: number, a: Assessment): boolean {
  if (w.mode !== 'conquest' || a.threat > 0 || a.own.length < 4) return false;
  return settleCandidates(w, slot).length > 0 && w.slots[slot].gold < TIERS.village.cost + 60;
}

/** Conquest: settle the nearest adjacent free region when the treasury allows, upgrade a border village when rich. */
function expandTerritory(w: World, slot: number, a: Assessment): boolean {
  const s = w.slots[slot];
  if (w.mode !== 'conquest' || a.threat > 0) return false;
  if (s.gold >= TIERS.village.cost + 60 && w.net[slot] > 0.5) {
    const own = w.regions.filter((r) => r.owner === slot);
    const cands = settleCandidates(w, slot);
    const home = s.settlements.find((b) => b.hp > 0);
    cands.sort((x, y) => (home ? Math.hypot(x.cx - home.x, x.cy - home.y) - Math.hypot(y.cx - home.x, y.cy - home.y) : 0));
    for (const r of cands) {
      // Try the center, then a ring of spots around it.
      for (let k = 0; k < 9; k++) {
        const ang = (k * 2 * Math.PI) / 8, rad = k === 0 ? 0 : 24;
        const x = r.cx + Math.cos(ang) * rad, y = r.cy + Math.sin(ang) * rad;
        if (!canSettle(w, slot, x, y)) { applyCommand(w, cmd(w, slot, { type: 'settle', payload: { x, y } }), true); return true; }
      }
    }
    if (own.length && s.gold >= TIERS.fortress.cost + 120) {
      const v = s.settlements.find((b) => b.hp > 0 && b.tier === 'village' && b.buildT <= 0 && w.regions[b.region].adj.some((x) => { const o = w.regions[x].owner; return o >= 0 && !allied(w, o, slot); }));
      if (v) { applyCommand(w, cmd(w, slot, { type: 'upgrade', payload: { id: v.id } }), true); return true; }
    }
  }
  return false;
}

/** One decision for one faction. Runs every `react` seconds. */
export function decide(w: World, slot: number): void {
  const s = w.slots[slot], P = PROFILES[s.diff];
  const a = assess(w, slot);
  if (expandTerritory(w, slot, a)) return;
  // In Conquest the army has to be paid, and land costs gold. Hold back when either says so.
  const holdGold = w.mode === 'conquest' && ((w.net[slot] < 0.3 && a.own.length > 4) || savingForLand(w, slot, a));
  if (!holdGold) shop(w, slot, a, P);
  const home = s.settlements.find((b) => b.hp > 0);
  if (!home) return;
  // Chances are per second of game time, so a fast thinker does not act more often than a slow one.
  const per = Math.min(1, P.react / 3);
  // Defend: units at home hold their ground behind the towers and engage what comes into reach.
  // Units out holding mines come back when the base is the bigger fight.
  const homeValue = a.threatAt ? ownValueNear(w, slot, a.threatAt.x, a.threatAt.y, 64) : 0;
  if (a.threatAt && a.threat > 0 && (a.threat >= 40 || a.threat > homeValue * 0.5)) {
    const t = a.threatAt;
    const rallyT = rallyPoint(w, t);
    const inside = a.own.filter((u) => Math.hypot(u.x - t.x, u.y - t.y) < 60);
    // Strong enough at home: sally and hit the attackers before they pick the towers apart.
    // Otherwise hold behind the towers and let what comes into reach be dealt with.
    if (homeValue >= 0.7 * a.threat) {
      let nearest: Unit | null = null, nd = Infinity;
      for (const e of a.enemy) { const d = Math.hypot(e.x - t.x, e.y - t.y); if (d < nd) { nd = d; nearest = e; } }
      const sally = inside.filter((u) => !(u.order && u.order.type === 'retreat'));
      for (const u of sally) u.held = false;
      order(w, slot, sally, nearest);
      if (nearest && P.retreats) s.aiWant = null;
      return;
    }
    const chasing = inside.filter((u) => u.order && u.order.type === 'attack' && u.order.tgt && Math.hypot(u.order.tgt.x - t.x, u.order.tgt.y - t.y) > 90);
    if (chasing.length) moveTo(w, slot, chasing, rallyT.x, rallyT.y);
    if (P.defendsMines) {
      const far = a.own.filter((u) => !u.held && Math.hypot(u.x - t.x, u.y - t.y) >= 60 && Math.hypot(u.x - t.x, u.y - t.y) < 160 && !(u.order && u.order.type === 'retreat'));
      const away = far.filter((u) => ownValueNear(w, slot, u.x, u.y, 24) < hostileValueNear(w, slot, u.x, u.y, 40) || a.threat > ownValueNear(w, slot, t.x, t.y, 60));
      if (away.length) moveTo(w, slot, away, rallyT.x, rallyT.y);
    }
    // The wave that is out stays out: pressure on the enemy is also defense.
    return;
  }
  // Reinforce: while a push is alive, fresh units go straight to it.
  if (P.reinforces && w.t - s.aiLast < 45 && a.own.some((u) => !u.held && u.order && u.order.type === 'attack')) {
    const target = nearestHostileBase(w, slot, home.x, home.y);
    if (target && a.held.length) { for (const u of a.held) u.held = false; order(w, slot, a.held, target); }
  }
  // Retreat: units losing a local fight pull back to heal.
  if (P.retreats) {
    const hurt = a.own.filter((u) => u.order && u.order.type === 'attack' && u.hp < TYPES[u.type].hp * 0.4 && hostileValueNear(w, slot, u.x, u.y, 30) > ownValueNear(w, slot, u.x, u.y, 30) * 1.3);
    if (hurt.length) pullBack(w, slot, hurt);
  }
  // Expand: two idle units to the nearest free mine nobody of ours is already holding.
  const mines = mineTargets(w, slot);
  // Free mines and enemy mines held by a scout or two both count. Send enough to take it.
  const free = mines
    .filter((m) => m.guard <= 40 && ownValueNear(w, slot, m.m.x, m.m.y, 20) === 0)
    .sort((x, y) => Math.hypot(x.m.x - home.x, x.m.y - home.y) - Math.hypot(y.m.x - home.x, y.m.y - home.y));
  const early = w.t < 120 && a.held.length >= 2;
  if (free.length && (early || a.held.length >= P.minWave / 2 + 2) && rand(w.rng) < (early ? 1 : P.expands * per)) {
    const need = free[0].guard > 0 ? 3 : 2;
    const party = a.held.slice(0, need);
    for (const u of party) u.held = false;
    if (free[0].guard > 0) order(w, slot, party, null);
    moveTo(w, slot, party, free[0].m.x, free[0].m.y);
    return;
  }
  // Harass: fast units raid an enemy mine nobody is standing on.
  const soft = mines.filter((m) => m.owned && m.guard === 0);
  const fast = a.held.filter(isFast).slice(0, 3);
  if (soft.length && fast.length >= 2 && a.held.length > P.minWave && rand(w.rng) < P.harass * per) {
    for (const u of fast) u.held = false;
    moveTo(w, slot, fast, soft[0].m.x, soft[0].m.y);
    return;
  }
  // Mass, then push in a grouped wave from the rally point. Defense at the target counts
  // hostile units and towers within 80px.
  const target = nearestHostileBase(w, slot, home.x, home.y);
  const rally = rallyPoint(w, home);
  let defense = target ? hostileValueNear(w, slot, target.x, target.y, 80) : a.enemyValue;
  if (target) for (const b of w.blds) if (b.kind === 'tower' && !allied(w, b.team, slot) && Math.hypot(b.x - target.x, b.y - target.y) < 80) defense += BLD[b.type].cost * 0.8;
  const heldValue = a.held.reduce((v, u) => v + TYPES[u.type].cost, 0);
  // The whole enemy army counts: whatever is in the field will meet the wave on the way.
  // The targeted rival's whole army counts: whatever it has in the field will meet the wave.
  const rivalValue = target ? a.enemy.filter((u) => allied(w, u.team, target.team)).reduce((v, u) => v + TYPES[u.type].cost, 0) : a.enemyValue;
  const opposition = Math.max(60, defense, rivalValue);
  const ready = a.held.length >= P.minWave && heldValue >= P.massRatio * opposition;
  const overdue = a.held.length >= Math.max(3, P.minWave / 2) && w.t - s.aiLast > P.pushEvery && heldValue >= 0.9 * opposition;
  if (target && (ready || overdue)) {
    const wave = a.held.slice();
    for (const u of wave) u.held = false;
    const prong = P.multiProng && wave.length >= 8 ? mines.filter((m) => m.guard > 0 && m.guard < heldValue / 3).sort((x, y) => x.guard - y.guard)[0] : undefined;
    if (prong) {
      const third = Math.floor(wave.length / 3);
      const flank = wave.slice(0, third);
      order(w, slot, flank, null);
      moveTo(w, slot, flank, prong.m.x, prong.m.y);
      order(w, slot, wave.slice(third), target);
    } else order(w, slot, wave, target);
    s.aiLast = w.t;
    s.aiWant = null;
    return;
  }
  // Otherwise gather: anything held that has drifted returns to the rally point.
  const stray = a.held.filter((u) => Math.hypot(u.x - rally.x, u.y - rally.y) > 28 && !u.order);
  if (stray.length) moveTo(w, slot, stray, rally.x, rally.y);
}

/** Extra difficulty for the fort tiers stays in DIFF. */
export const FORT = DIFF;
