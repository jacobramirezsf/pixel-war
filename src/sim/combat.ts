// Targeting, damage, and elimination.

import { BLD } from '../data/buildings.ts';
import { TEAM, TNAME } from '../data/teams.ts';
import { TYPES, type UnitDef } from '../data/units.ts';
import { removeBld } from './buildings.ts';
import { rnd } from './rng.ts';
import type { Target, Unit, World } from './types.ts';
import { allied, hasLivingSettlement, say } from './world.ts';

/** Everything a team may attack: hostile units, hostile towers, hostile bases. */
export function targetsFor(w: World, team: number): Target[] {
  const a: Target[] = [];
  for (const u of w.units) if (!allied(w, u.team, team) && u.hp > 0) a.push(u);
  for (const b of w.blds) if (!allied(w, b.team, team) && b.kind === 'tower' && b.hp > 0) a.push(b);
  for (let i = 0; i < w.nP; i++) {
    if (allied(w, i, team) || !w.slots[i].alive) continue;
    for (const s of w.slots[i].settlements) if (s.hp > 0) a.push(s);
  }
  return a;
}

/** Edge distance. Bases count as radius 10, buildings as radius 4. */
export function edist(u: { x: number; y: number }, t: Target): number {
  const d = Math.hypot(u.x - t.x, u.y - t.y);
  return t.ent === 'base' ? Math.max(0, d - 10) : t.ent === 'bld' ? Math.max(0, d - 4) : d;
}

export function dirTo(a: { x: number; y: number }, b: { x: number; y: number }): [number, number] {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

export function hasBanner(w: World, u: Unit): boolean {
  for (const o of w.units) {
    const A = TYPES[o.type].aura;
    if (A && o.team === u.team && o !== u && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) <= A) return true;
  }
  return false;
}

/** Remove a faction from play. Slot 0 is the player, so its elimination ends the game. */
export function elim(w: World, slot: number): void {
  const s = w.slots[slot];
  if (!s.alive) return;
  s.alive = false;
  for (const b of s.settlements) w.fx.push({ k: 'boom', x: b.x, y: b.y, r: 22, t: 0.25 });
  if (slot === 0) { w.over = 'lose'; return; }
  for (const u of w.units) if (u.team === slot) u.hp = 0;
  for (const q of w.blds.slice()) if (q.team === slot) removeBld(w, q);
  say(w, TNAME[slot] + ' IS ELIMINATED', 2.5);
  let foes = 0;
  for (let i = 0; i < w.nP; i++) if (w.slots[i].alive && !allied(w, 0, i)) foes++;
  if (!foes) w.over = 'win';
}

export function damage(w: World, t: Target, dmg: number): void {
  if (t.ent === 'bld') {
    dmg = Math.max(1, dmg - (BLD[t.type].armor || 0));
    t.hp -= dmg;
    if (t.hp <= 0) { removeBld(w, t); w.fx.push({ k: 'die', x: t.x, y: t.y, t: 0.35 }); }
    return;
  }
  if (t.ent === 'unit') { dmg = Math.max(1, dmg - (TYPES[t.type].armor || 0)); t.flash = 0.12; }
  t.hp -= dmg;
  if (t.ent === 'base' && t.hp <= 0) {
    t.hp = 0;
    if (!hasLivingSettlement(w, t.team)) elim(w, t.team);
  }
}

/** Splash hit. The primary target takes full damage, everything else in range takes 60%. */
export function explode(w: World, u: Unit, x: number, y: number, r: number, dmg: number, primary: Target | null): void {
  w.fx.push({ k: 'boom', x, y, r, t: 0.25 });
  const hit = (t: Target): void => {
    const dd = Math.hypot(t.x - x, t.y - y), d = t.ent === 'base' ? Math.max(0, dd - 10) : t.ent === 'bld' ? Math.max(0, dd - 4) : dd;
    if (d <= r) damage(w, t, t === primary ? dmg : Math.round(dmg * 0.6));
  };
  for (const t of w.units) if (!allied(w, t.team, u.team) && t.hp > 0) hit(t);
  for (const t of w.blds.slice()) if (!allied(w, t.team, u.team) && t.hp > 0) hit(t);
  for (let i = 0; i < w.nP; i++) {
    if (allied(w, i, u.team) || !w.slots[i].alive) continue;
    for (const s of w.slots[i].settlements) hit(s);
  }
}

export function attack(w: World, u: Unit, t: Target, T: UnitDef): void {
  let dmg = T.dmg;
  if (hasBanner(w, u)) dmg = Math.round(dmg * 1.3);
  if (T.suicide) { explode(w, u, u.x, u.y, T.splash!, dmg, t); u.hp = 0; return; }
  if (T.range > 12) w.fx.push({ k: 'shot', x1: u.x, y1: u.y - 3, x2: t.x, y2: t.y - 2, t: 0.1, c: T.shot || TEAM[u.team] });
  else w.fx.push({ k: 'hit', x: t.x + rnd(w.rng, -2, 2), y: t.y - 3 + rnd(w.rng, -2, 2), t: 0.14 });
  if (T.splash) explode(w, u, t.x, t.y, T.splash, dmg, t);
  else damage(w, t, dmg);
}
