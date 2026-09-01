// Civilian life. Villagers are cheap units homed to a settlement. A pass every CIV.every ticks
// grows towns, fills jobs, moves people about, and sends them running when enemies come.
// Nothing here pathfinds: villagers stay inside their town and walk straight lines.

import { CIV, JOBS, TOWN_JOBS } from '../data/civ.ts';
import { TYPES } from '../data/units.ts';
import { regionAt } from './conquest.ts';
import { rand } from './rng.ts';
import { forNear, gridOf } from './spatial.ts';
import type { Building, Settlement, Unit, World } from './types.ts';
import { allied, cheat, inZone } from './world.ts';
import { mkUnit } from './units.ts';

export const isCiv = (u: Unit): boolean => TYPES[u.type].role === 'civ';

/** The settlement a building belongs to: same region, or the nearest within reach when there are no regions. */
export function settlementFor(w: World, b: { x: number; y: number; team: number }, homes: Settlement[]): Settlement | null {
  if (w.regionOf) {
    const r = regionAt(w, b.x, b.y);
    let best: Settlement | null = null, bd = Infinity;
    for (const s of homes) if (s.region === r) { const d = Math.hypot(s.x - b.x, s.y - b.y); if (d < bd) { bd = d; best = s; } }
    if (best) return best;
  }
  let best: Settlement | null = null, bd = CIV.reach;
  for (const s of homes) { const d = Math.hypot(s.x - b.x, s.y - b.y); if (d < bd) { bd = d; best = s; } }
  return best;
}

/** Finished buildings that belong to a settlement. */
export function buildingsOf(w: World, s: Settlement): Building[] {
  const homes = w.slots[s.team].settlements.filter((b) => b.hp > 0 && b.tier !== 'outpost');
  return w.blds.filter((b) => b.team === s.team && b.buildT <= 0 && settlementFor(w, b, homes) === s);
}

/** Gold per second from staffed jobs across a slot's towns. Cached by the pass. */
export function civIncome(w: World, slot: number): number {
  let g = 0;
  for (const s of w.slots[slot].settlements) if (s.hp > 0) g += s.civ.income;
  return g;
}

/** Give a new settlement its first residents. */
export function seedResidents(w: World, s: Settlement, n = CIV.starting): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const u = mkUnit(w, s.team, 'civ', s.x + Math.cos(a) * 14, s.y + 12 + Math.sin(a) * 6);
    u.home = s.id;
    u.civT = 1 + i;
    w.units.push(u);
  }
  s.civ.residents = n;
  s.civ.peak = n;
}

/** Safest spot for a villager of this town: a finished castle nearby, else the settlement. */
function refuge(s: Settlement, castles: Building[]): { x: number; y: number } {
  let best: { x: number; y: number } = { x: s.x, y: s.y + 10 }, bd = 100;
  for (const c of castles) { const d = Math.hypot(c.x - s.x, c.y - s.y); if (d < bd) { bd = d; best = { x: c.x, y: c.y + 14 }; } }
  return best;
}

export function civTick(w: World): void {
  if (!w.rules.civilians || w.tick % CIV.every !== 0) return;
  const dt = CIV.every / 60;
  const grid = gridOf(w);
  // Villagers by home, once.
  const byHome = new Map<number, Unit[]>();
  for (const u of w.units) if (u.hp > 0 && isCiv(u) && u.type !== 'caravan') { const l = byHome.get(u.home); if (l) l.push(u); else byHome.set(u.home, [u]); }
  for (let slot = 0; slot < w.nP; slot++) {
    const S = w.slots[slot];
    if (S.neutral) continue;
    const homes = S.settlements.filter((s) => s.hp > 0 && s.tier !== 'outpost');
    if (!homes.length) continue;
    // Buildings grouped by the settlement they serve.
    const bldsOf = new Map<number, Building[]>();
    for (const b of w.blds) {
      if (b.team !== slot || b.buildT > 0) continue;
      const s = settlementFor(w, b, homes);
      if (!s) continue;
      const l = bldsOf.get(s.id); if (l) l.push(b); else bldsOf.set(s.id, [b]);
    }
    for (const s of homes) {
      const people = byHome.get(s.id) ?? [];
      const blds = bldsOf.get(s.id) ?? [];
      const c = s.civ;
      c.residents = people.length;
      c.peak = Math.max(c.peak, c.residents);
      c.housing = Math.min(CIV.maxPerTown, CIV.baseHousing + CIV.houseHousing * blds.filter((b) => b.type === 'house').length);
      // Danger: any hostile fighter within the danger radius.
      let danger = false;
      forNear(grid, s.x, s.y, CIV.dangerRadius, (o) => { if (!danger && o.hp > 0 && !allied(w, o.team, slot) && !isCiv(o) && TYPES[o.type].dmg > 0 && Math.hypot(o.x - s.x, o.y - s.y) <= CIV.dangerRadius) danger = true; });
      c.safeT = danger ? 0 : Math.min(999, c.safeT + dt);
      // Jobs: the town itself, then each economic building, nearest first for the unemployed.
      const slots: { id: number; x: number; y: number; cap: number; filled: number; income: number }[] = [];
      const tj = TOWN_JOBS[s.tier];
      if (s.buildT <= 0 && tj.slots) slots.push({ id: 0, x: s.x, y: s.y, cap: tj.slots, filled: 0, income: tj.income });
      for (const b of blds) { const j = JOBS[b.type]; if (j) slots.push({ id: b.id, x: b.x, y: b.y, cap: j.slots, filled: 0, income: j.income }); }
      const byId = new Map(slots.map((j) => [j.id, j]));
      // Keep valid assignments, drop the rest.
      for (const u of people) {
        const j = u.job >= 0 ? byId.get(u.job) : undefined;
        if (j && j.filled < j.cap && u.fleeT <= 0) j.filled++; else u.job = -1;
      }
      for (const u of people) {
        if (u.job >= 0 || u.fleeT > 0) continue;
        let best: typeof slots[number] | null = null, bd = Infinity;
        for (const j of slots) { if (j.filled >= j.cap) continue; const d = Math.hypot(j.x - u.x, j.y - u.y); if (d < bd) { bd = d; best = j; } }
        if (best) { best.filled++; u.job = best.id; }
      }
      c.jobs = slots.reduce((a, j) => a + j.cap, 0);
      c.employed = slots.reduce((a, j) => a + j.filled, 0);
      const golden = inZone(w, slot, 'golden', s.x, s.y);
      c.income = Math.round(slots.reduce((a, j) => a + j.filled * j.income, 0) * (golden ? 2 : 1) * 100) / 100;
      // Growth: safe, room, and something to do (or a very small town).
      const canGrow = !danger && c.safeT >= CIV.safeAfter && c.residents < c.housing && (c.employed < c.jobs || c.residents < 4);
      c.growT = canGrow ? c.growT + dt * (golden ? 2 : 1) * (cheat(w, slot, 'fastEcon') ? 5 : 1) : 0;
      if (canGrow && c.growT >= CIV.growEvery) {
        c.growT = 0;
        const u = mkUnit(w, slot, 'civ', s.x + (rand(w.rng) - 0.5) * 16, s.y + 12);
        u.home = s.id;
        u.civT = 2;
        w.units.push(u);
        c.residents++;
      }
      // State.
      c.state = danger ? 'attacked' : c.safeT < CIV.recoverAfter || c.residents < c.peak * 0.7 ? 'recovering' : canGrow ? 'growing' : 'stable';
      // Behavior: flee, or drift between work, home, and the square.
      const castles = blds.filter((b) => b.type === 'castle');
      const safe = refuge(s, castles);
      for (const u of people) {
        let threat = false;
        if (!inZone(w, slot, 'sanctuary', u.x, u.y)) forNear(grid, u.x, u.y, CIV.fleeRadius, (o) => { if (!threat && o.hp > 0 && !allied(w, o.team, slot) && !isCiv(o) && TYPES[o.type].dmg > 0 && Math.hypot(o.x - u.x, o.y - u.y) <= CIV.fleeRadius) threat = true; });
        if (threat) { u.fleeT = CIV.safeAfter; u.order = { type: 'move', x: safe.x + (rand(w.rng) - 0.5) * 10, y: safe.y + (rand(w.rng) - 0.5) * 6 }; continue; }
        if (u.fleeT > 0) { u.fleeT -= dt; if (!u.order) u.order = { type: 'move', x: safe.x + (rand(w.rng) - 0.5) * 10, y: safe.y }; continue; }
        u.civT -= dt;
        if (u.civT > 0) continue;
        u.civT = CIV.wanderMin + rand(w.rng) * (CIV.wanderMax - CIV.wanderMin);
        const j = u.job >= 0 ? byId.get(u.job) : undefined;
        const at = j && rand(w.rng) < 0.7 ? { x: j.x, y: j.y } : { x: s.x, y: s.y + 8 };
        const a = rand(w.rng) * Math.PI * 2, r = 4 + rand(w.rng) * CIV.wanderRadius;
        u.order = { type: 'move', x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
      }
    }
  }
  // Villagers whose settlement is gone drift to the nearest living one of their side, or stay put.
  for (const [home, people] of byHome) {
    if (w.slots.some((S) => S.settlements.some((s) => s.id === home && s.hp > 0))) continue;
    for (const u of people) {
      let best: Settlement | null = null, bd = Infinity;
      for (const s of w.slots[u.team].settlements) if (s.hp > 0) { const d = Math.hypot(s.x - u.x, s.y - u.y); if (d < bd) { bd = d; best = s; } }
      if (best) { u.home = best.id; u.job = -1; u.order = { type: 'move', x: best.x, y: best.y + 10 }; }
    }
  }
}
