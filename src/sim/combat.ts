// Targeting, damage, and elimination. Unit scans go through the spatial hash.

import { BLD } from '../data/buildings.ts';
import { TEAM, TNAME } from '../data/teams.ts';
import { TYPES, unitVisible, type UnitDef } from '../data/units.ts';
import { removeBld } from './buildings.ts';
import { rnd } from './rng.ts';
import { onSettlementDeath } from './conquest.ts';
import { maxHp, rank } from './units.ts';
import { forNear, gridOf, nearestHostileWithin } from './spatial.ts';
import type { Settlement, Target, Unit, World, Building } from './types.ts';
import { allied, hasLivingSettlement, say } from './world.ts';

/** Everything a team may attack: hostile units, hostile towers, hostile bases. Full scan. */
export function targetsFor(w: World, team: number): Target[] {
  const a: Target[] = [];
  for (const u of w.units) if (!allied(w, u.team, team) && u.hp > 0 && unitVisible(u)) a.push(u);
  a.push(...staticTargets(w, team));
  return a;
}

/** Hostile towers and bases for a team. Small list, cached per slot per tick by the step. */
export function staticTargets(w: World, team: number): (Building | Settlement)[] {
  const a: (Building | Settlement)[] = [];
  // Bandits and rebels raid people, not walls. They never lay siege.
  if (w.slots[team].neutral) return a;
  for (const b of w.blds) if (!allied(w, b.team, team) && b.kind === 'tower' && b.hp > 0) a.push(b);
  for (let i = 0; i < w.nP; i++) {
    if (allied(w, i, team) || !w.slots[i].alive) continue;
    const passive = w.slots[i].neutral;
    for (const s of w.slots[i].settlements) if (s.hp > 0 && !(passive && s.tier !== 'camp')) a.push(s);
  }
  return a;
}

/** Edge distance. Bases count as radius 10, buildings as radius 4. */
export function edist(u: { x: number; y: number }, t: Target): number {
  const d = Math.hypot(u.x - t.x, u.y - t.y);
  return t.ent === 'base' ? Math.max(0, d - 10) : t.ent === 'bld' ? Math.max(0, d - 4) : d;
}

/** Per-tick targeting caches built by the step. Truces count: a truced faction is not hostile. */
export interface TargetCache {
  /** hostile[slot][team]: does `slot` fight `team`. */
  hostile: boolean[][];
  /** Visible hostile units per slot, in world order. */
  hostiles: Unit[][];
  /** Hostile towers and bases per slot. */
  statics: (Building | Settlement)[][];
}

export function buildTargetCache(w: World): TargetCache {
  const hostile: boolean[][] = [], hostiles: Unit[][] = [], statics: (Building | Settlement)[][] = [];
  for (let i = 0; i < w.nP; i++) {
    hostile.push(w.slots.map((_, j) => !allied(w, i, j)));
    hostiles.push([]);
    statics.push(staticTargets(w, i));
  }
  for (const u of w.units) {
    if (u.hp <= 0 || !unitVisible(u)) continue;
    for (let i = 0; i < w.nP; i++) if (hostile[i][u.team]) hostiles[i].push(u);
  }
  return { hostile, hostiles, statics };
}

/**
 * Nearest hostile anything for a unit. Units come from the grid within the unit's aggro radius,
 * with a linear scan of the cached hostile list when nothing is that close. Towers and bases come
 * from the per-slot cache. Same answer as scanning everything.
 */
export function nearestHostile(w: World, u: Unit, R: number, tc: TargetCache): { tgt: Target | null; best: number } {
  const list = tc.hostiles[u.team];
  // The grid pays off only when there are more hostiles than cells inside R.
  const cells = ((2 * R) / 16 + 1) ** 2;
  const near = list.length > cells ? nearestHostileWithin(gridOf(w), u.x, u.y, R, tc.hostile[u.team], u, unitVisible) : { u: null, d2: Infinity };
  let tgt: Target | null = near.u, best = near.u ? Math.sqrt(near.d2) : Infinity;
  if (!near.u) {
    let bd = Infinity;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === u) continue;
      const dx = o.x - u.x, dy = o.y - u.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; tgt = o; }
    }
    best = tgt ? Math.sqrt(bd) : Infinity;
  }
  const st = tc.statics[u.team];
  for (let i = 0; i < st.length; i++) { const d = edist(u, st[i]); if (d < best) { best = d; tgt = st[i]; } }
  return { tgt, best };
}

export function dirTo(a: { x: number; y: number }, b: { x: number; y: number }): [number, number] {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

/** Which teams field an aura of each kind this tick. Lets the per-unit checks skip the grid. */
export function auraTeams(w: World): { aura: boolean[]; speedAura: boolean[]; guardAura: boolean[] } {
  const mk = (): boolean[] => Array.from({ length: w.nP }, () => false);
  const out = { aura: mk(), speedAura: mk(), guardAura: mk() };
  for (const u of w.units) {
    if (u.hp <= 0) continue;
    const T = TYPES[u.type];
    if (T.aura) out.aura[u.team] = true;
    if (T.speedAura) out.speedAura[u.team] = true;
    if (T.guardAura) out.guardAura[u.team] = true;
  }
  return out;
}

/** True when a friendly unit with the given aura field stands within that aura. */
function inAura(w: World, u: Unit, field: 'aura' | 'speedAura' | 'guardAura', maxR: number): boolean {
  const at = w.auras as ReturnType<typeof auraTeams> | null;
  if (at && !at[field][u.team]) return false;
  const g = gridOf(w);
  const x0 = Math.max(0, ((u.x - maxR) / 16) | 0), x1 = Math.min(g.cols - 1, ((u.x + maxR) / 16) | 0);
  const y0 = Math.max(0, ((u.y - maxR) / 16) | 0), y1 = Math.min(g.rows - 1, ((u.y + maxR) / 16) | 0);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) {
      const cell = g.cells[cy * g.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (o.team !== u.team || o === u || o.hp <= 0) continue;
        const A = TYPES[o.type][field];
        if (A && Math.hypot(o.x - u.x, o.y - u.y) <= A) return true;
      }
    }
  return false;
}

export const hasBanner = (w: World, u: Unit): boolean => inAura(w, u, 'aura', 18);
export const hasSpeedAura = (w: World, u: Unit): boolean => inAura(w, u, 'speedAura', 20);
const guarded = (w: World, u: Unit): boolean => inAura(w, u, 'guardAura', 20);

/** Remove a faction from play. Slot 0 is the player, so its elimination ends the game. */
export function elim(w: World, slot: number): void {
  const s = w.slots[slot];
  if (!s.alive || s.neutral) return;
  s.alive = false;
  for (const b of s.settlements) w.fx.push({ k: 'boom', x: b.x, y: b.y, r: 22, t: 0.25 });
  if (slot === 0) { w.over = 'lose'; return; }
  for (const u of w.units) if (u.team === slot) u.hp = 0;
  for (const q of w.blds.slice()) if (q.team === slot) removeBld(w, q);
  say(w, TNAME[slot] + ' IS ELIMINATED', 2.5);
  let foes = 0;
  for (let i = 0; i < w.nP; i++) if (w.slots[i].alive && !w.slots[i].neutral && !allied(w, 0, i)) foes++;
  if (!foes) w.over = 'win';
}

/** Armor for a unit right now. Treants harden in the trees. */
export function unitArmor(w: World, u: Unit): number {
  const T = TYPES[u.type];
  let a = T.armor || 0;
  if (T.treeArmor && w.map.tiles[((u.y / 8) | 0) * w.map.cols + ((u.x / 8) | 0)] === 2) a += T.treeArmor;
  return a;
}

/** Apply damage. Returns the amount that landed. `ranged` lets guard auras soften it. */
export function damage(w: World, t: Target, dmg: number, ranged = false, by: Unit | null = null): number {
  if (t.ent === 'bld') {
    dmg = Math.max(1, dmg - (BLD[t.type].armor || 0));
    t.hp -= dmg;
    if (t.hp <= 0) { removeBld(w, t); w.fx.push({ k: 'die', x: t.x, y: t.y, t: 0.35 }); }
    return dmg;
  }
  if (t.ent === 'unit') {
    dmg = Math.max(1, dmg - unitArmor(w, t));
    if (ranged && guarded(w, t)) dmg = Math.max(1, dmg - 3);
    t.flash = 0.12;
  }
  t.hp -= dmg;
  w.fx.push({ k: 'dmg', x: t.x, y: t.y - 6, t: 0.6, n: dmg });
  if (t.ent === 'base') {
    if (by) t.hitBy = by.team;
    if (t.hp <= 0) {
      t.hp = 0;
      onSettlementDeath(w, t);
      if (!hasLivingSettlement(w, t.team)) elim(w, t.team);
    }
  } else if (by && t.hp <= 0 && w.rules.veterancy && t.ent === 'unit') by.kills++;
  return dmg;
}

/** Splash hit. The primary target takes full damage, everything else in range takes 60%. */
export function explode(w: World, u: Unit, x: number, y: number, r: number, dmg: number, primary: Target | null, ranged = false): void {
  w.fx.push({ k: 'boom', x, y, r, t: 0.25 });
  const hit = (t: Target): void => {
    const dd = Math.hypot(t.x - x, t.y - y), d = t.ent === 'base' ? Math.max(0, dd - 10) : t.ent === 'bld' ? Math.max(0, dd - 4) : dd;
    if (d <= r) damage(w, t, t === primary ? dmg : Math.round(dmg * 0.6), ranged, u);
  };
  const victims: Unit[] = [];
  forNear(gridOf(w), x, y, r, (t) => { if (!allied(w, t.team, u.team) && t.hp > 0) victims.push(t); });
  victims.sort((a, b) => a.ix - b.ix);
  for (const t of victims) hit(t);
  for (const t of w.blds.slice()) if (!allied(w, t.team, u.team) && t.hp > 0) hit(t);
  for (let i = 0; i < w.nP; i++) {
    if (allied(w, i, u.team) || !w.slots[i].alive) continue;
    for (const s of w.slots[i].settlements) hit(s);
  }
}

/** Status effects a hit leaves on a unit target. */
function afflict(t: Target, T: UnitDef): void {
  if (t.ent !== 'unit') return;
  if (T.slow) t.slowT = Math.max(t.slowT, T.slow);
  if (T.root) t.rootT = Math.max(t.rootT, T.root);
}

export function attack(w: World, u: Unit, t: Target, T: UnitDef): void {
  let dmg = T.dmg;
  if (w.rules.veterancy && u.kills) dmg = Math.round(dmg * (1 + 0.1 * rank(u)));
  if (hasBanner(w, u)) dmg = Math.round(dmg * 1.3);
  if (T.vsBld && t.ent !== 'unit') dmg = Math.round(dmg * T.vsBld);
  if (T.charge && u.run >= 20) dmg = Math.round(dmg * T.charge);
  u.run = 0;
  if (T.stealth) u.reveal = 3;
  const ranged = T.range > 12;
  if (T.suicide) { explode(w, u, u.x, u.y, T.splash!, dmg, t); u.hp = 0; return; }
  if (ranged) w.fx.push({ k: 'shot', x1: u.x, y1: u.y - 3, x2: t.x, y2: t.y - 2, t: 0.1, c: T.shot || TEAM[u.team] });
  else w.fx.push({ k: 'hit', x: t.x + rnd(w.fxRng, -2, 2), y: t.y - 3 + rnd(w.fxRng, -2, 2), t: 0.14 });
  let dealt = 0;
  if (T.splash) { explode(w, u, t.x, t.y, T.splash, dmg, t, ranged); dealt = dmg; }
  else { dealt = damage(w, t, dmg, ranged, u); afflict(t, T); }
  if (T.pierce) {
    // Everything hostile within 4px of the shot line takes the hit too.
    const dx = t.x - u.x, dy = t.y - u.y, len = Math.hypot(dx, dy) || 1;
    const hits: Unit[] = [];
    forNear(gridOf(w), (u.x + t.x) / 2, (u.y + t.y) / 2, len / 2 + 6, (o) => {
      if (o === t || allied(w, o.team, u.team) || o.hp <= 0) return;
      const px = o.x - u.x, py = o.y - u.y, along = (px * dx + py * dy) / len;
      if (along < 0 || along > len) return;
      if (Math.abs(px * dy - py * dx) / len <= 4) hits.push(o);
    });
    hits.sort((a, b) => a.ix - b.ix);
    for (const o of hits) { damage(w, o, dmg, true, u); afflict(o, T); }
  }
  if (T.chain) {
    const near: Unit[] = [];
    forNear(gridOf(w), t.x, t.y, 12, (o) => { if (o !== t && !allied(w, o.team, u.team) && o.hp > 0 && unitVisible(o) && Math.hypot(o.x - t.x, o.y - t.y) <= 12) near.push(o); });
    near.sort((a, b) => a.ix - b.ix);
    for (const o of near.slice(0, T.chain)) {
      w.fx.push({ k: 'shot', x1: t.x, y1: t.y - 2, x2: o.x, y2: o.y - 2, t: 0.1, c: T.shot || TEAM[u.team] });
      damage(w, o, Math.round(dmg / 2), true, u);
    }
  }
  if (T.lifesteal && dealt > 0) u.hp = Math.min(maxHp(u), u.hp + dealt * T.lifesteal);
}
