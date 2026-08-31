// Powers resolve here. Costs, cooldowns, and effects are deterministic sim state.

import { POWERS, type PowerKey } from '../data/powers.ts';
import { roster, TYPES } from '../data/units.ts';
import { TEAM } from '../data/teams.ts';
import { passableFor } from './buildings.ts';
import { damage, explode } from './combat.ts';
import type { Unit, World } from './types.ts';
import { maxHp, mkUnit } from './units.ts';
import { allied, count } from './world.ts';

/** Null when the power went off, otherwise why it did not. */
export function castPower(w: World, slot: number, key: PowerKey, x: number, y: number): string | null {
  const P = POWERS[key], s = w.slots[slot];
  if ((s.powerCd[key] ?? 0) > 0) return P.name + ' is recharging (' + Math.ceil(s.powerCd[key]!) + 's)';
  const free = w.mode === 'sand' || !Number.isFinite(s.gold);
  if (!free && s.gold < P.cost) return 'Need ' + P.cost + ' gold';
  // Powers are rare and may fire between ticks, when the spatial grid is stale. Scan directly.
  const near = (r: number, ok: (u: Unit) => boolean): Unit[] => w.units.filter((u) => u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= r && ok(u));
  switch (key) {
    case 'barrage':
      w.strikes.push({ team: slot, x, y, r: P.r, dmg: 45, t: 1.4 });
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 1.4, c: TEAM[slot] });
      break;
    case 'smite': {
      const foes = near(P.r + 6, (u) => !allied(w, u.team, slot));
      if (!foes.length) return 'No enemy there';
      let best = foes[0], bd = Infinity;
      for (const u of foes) { const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; best = u; } }
      w.fx.push({ k: 'bolt', x: best.x, y: best.y, t: 0.35 });
      damage(w, best, 90, true);
      break;
    }
    case 'heal': {
      const own = near(P.r, (u) => u.team === slot);
      if (!own.length) return 'None of your units there';
      for (const u of own) { u.hp = Math.min(maxHp(u), u.hp + 40); w.fx.push({ k: 'heal', x: u.x, y: u.y - 7, t: 0.4 }); }
      break;
    }
    case 'haste': {
      const own = near(P.r, (u) => u.team === slot);
      if (!own.length) return 'None of your units there';
      for (const u of own) u.hasteT = 8;
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.5, c: '#f2d34a' });
      break;
    }
    case 'freeze': {
      const foes = near(P.r, (u) => !allied(w, u.team, slot));
      if (!foes.length) return 'No enemy there';
      for (const u of foes) { u.rootT = Math.max(u.rootT, 3); u.slowT = Math.max(u.slowT, 5); }
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.6, c: '#67e8f9' });
      break;
    }
    case 'reinforce': {
      let ok = false;
      for (const b of s.settlements) if (b.hp > 0 && Math.hypot(b.x - x, b.y - y) < 70) ok = true;
      if (!ok) for (const u of w.units) if (u.team === slot && u.hp > 0 && Math.hypot(u.x - x, u.y - y) <= 40) { ok = true; break; }
      if (!ok) return 'Too far from your army or settlements';
      if (count(w, slot) + 3 > w.cap) return 'Army cap reached';
      const line = roster(s.race).filter((k) => TYPES[k].role === 'line' && TYPES[k].cost <= 30);
      const k = line[0] ?? roster(s.race)[1];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2, ux = x + Math.cos(a) * 7, uy = y + Math.sin(a) * 7;
        if (passableFor(w, slot, ux, uy)) { const u = mkUnit(w, slot, k, ux, uy); u.order = { type: 'attack', tgt: null }; w.units.push(u); }
      }
      w.fx.push({ k: 'mark', x, y, r: P.r, t: 0.5, c: TEAM[slot] });
      break;
    }
  }
  if (!free) s.gold -= P.cost;
  s.powerCd[key] = w.cheats.powers && slot === 0 ? 0 : P.cd;
  return null;
}

/** Cooldowns tick down, barrages land. */
export function powersTick(w: World, dt: number): void {
  for (const s of w.slots) for (const k of Object.keys(s.powerCd) as PowerKey[]) { const v = s.powerCd[k]!; if (v > 0) s.powerCd[k] = Math.max(0, v - dt); }
  if (!w.strikes.length) return;
  const rest: typeof w.strikes = [];
  for (const k of w.strikes) {
    k.t -= dt;
    if (k.t > 0) { rest.push(k); continue; }
    // A barrage hits everyone in the circle, including the caster's own units. Aim well.
    const shooter = { ent: 'unit', team: k.team } as unknown as Unit;
    explode(w, shooter, k.x, k.y, k.r, k.dmg, null, true);
    for (const u of w.units) if (u.hp > 0 && allied(w, u.team, k.team) && Math.hypot(u.x - k.x, u.y - k.y) <= k.r) damage(w, u, Math.round(k.dmg * 0.6), true);
  }
  w.strikes = rest;
}
