// The per-tick update. Order matches the prototype exactly.

import { BLD } from '../data/buildings.ts';
import { TEAM } from '../data/teams.ts';
import { TYPES, unitVisible, type UnitDef } from '../data/units.ts';
import { aiTick } from './ai/index.ts';
import { addBld, bldAtPx, canBuild, passableFor, removeBld } from './buildings.ts';
import { BUILD_CAP } from '../data/buildings.ts';
import { mkUnit } from './units.ts';
import { attack, damage, dirTo, edist, targetsFor } from './combat.ts';
import { drainQueue } from './commands.ts';
import { dominationTick, hasEconomy, incomeTick, mineTick, minesHeld, payRepair } from './economy.ts';
import { clamp, tileAt } from './map.ts';
import { computeFlow, flowDir } from './pathing.ts';
import { rand, rnd } from './rng.ts';
import type { Building, Target, Unit, World } from './types.ts';
import { allied, count, DT, mapH, mapW, primaryBase } from './world.ts';

type Vec = [number, number] | null;

function moveLogic(w: World, u: Unit, T: UnitDef, tgt: Target | null, best: number): Vec {
  if (u.order && u.order.type === 'move') {
    const dx = u.order.x - u.x, dy = u.order.y - u.y, d = Math.hypot(dx, dy);
    if (d < 2.5) { u.order = null; return null; }
    return [dx / d, dy / d];
  }
  if (u.order && u.order.type === 'attack') {
    let ct = u.order.tgt;
    if (ct && ct.hp <= 0) { ct = null; u.order.tgt = null; }
    if (!ct) ct = tgt;
    if (!ct) return null;
    const d = edist(u, ct);
    if (d <= T.range) return null;
    if (!T.fly && (ct.ent === 'base' || d > 40)) { const f = flowDir(w, u); if (f) return f; }
    return dirTo(u, ct);
  }
  if (tgt && best < T.aggro && best > T.range) return dirTo(u, tgt);
  return null;
}

/** True when a friendly Warchief is within its aura. */
function hasSpeedAura(w: World, u: Unit): boolean {
  for (const o of w.units) {
    const A = TYPES[o.type].speedAura;
    if (A && o.team === u.team && o !== u && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) <= A) return true;
  }
  return false;
}

/** Deaths this tick: necromancers raise skeletons, colossi split. Runs before corpses are removed. */
function onDeaths(w: World, dead: Unit[]): void {
  for (const d of dead) {
    const T = TYPES[d.type];
    if (T.split && count(w, d.team) < w.cap) {
      for (let i = 0; i < T.split.n && count(w, d.team) < w.cap; i++) {
        const a = (i / T.split.n) * Math.PI * 2;
        const x = d.x + Math.cos(a) * 6, y = d.y + Math.sin(a) * 6;
        if (passableFor(w, d.team, x, y)) w.units.push(mkUnit(w, d.team, T.split.unit, x, y));
      }
    }
    // Nearest hostile necromancer claims the corpse.
    let nec: Unit | null = null, nd = Infinity;
    for (const o of w.units) {
      const R = TYPES[o.type].raise;
      if (!R || o.hp <= 0 || allied(w, o.team, d.team)) continue;
      const dist = Math.hypot(o.x - d.x, o.y - d.y);
      if (dist <= R && dist < nd) { nd = dist; nec = o; }
    }
    if (nec && count(w, nec.team) < w.cap && passableFor(w, nec.team, d.x, d.y)) {
      const sk = mkUnit(w, nec.team, 'u_inf', d.x, d.y);
      sk.order = nec.order && nec.order.type === 'attack' ? { type: 'attack', tgt: null } : null;
      w.units.push(sk);
      w.fx.push({ k: 'heal', x: d.x, y: d.y - 7, t: 0.3 });
    }
  }
}

/** Move, sliding along blockers. Returns the enemy building that stopped the move, if any. */
function tryMove(w: World, u: Unit, mv: [number, number], sp: number, fly: boolean | undefined): Building | null {
  const nx = u.x + mv[0] * sp, ny = u.y + mv[1] * sp;
  if (fly || passableFor(w, u.team, nx, ny)) { u.x = nx; u.y = ny; return null; }
  const b = bldAtPx(w, nx, ny);
  const blk = b && !allied(w, b.team, u.team) && b.kind !== 'trap' ? b : null;
  if (passableFor(w, u.team, nx, u.y)) { u.x = nx; return blk; }
  if (passableFor(w, u.team, u.x, ny)) u.y = ny;
  return blk;
}

/** Advance one fixed tick. Queued commands apply first, then the world updates. */
export function step(w: World): void {
  drainQueue(w);
  if (w.over || w.phase !== 'play') { w.tick++; return; }
  const dt = DT;
  if (w.flowDirty) { computeFlow(w); w.flowDirty = false; }
  w.tick++;
  w.t += dt;
  for (const u of w.units) { u.ox = u.x; u.oy = u.y; }
  const eco = hasEconomy(w);
  mineTick(w);
  const mcount = minesHeld(w);
  if (eco) {
    incomeTick(w, dt, mcount);
    aiTick(w, dt);
    if (w.mode === 'dom') { dominationTick(w, dt, mcount); if (w.over) return; }
    if (w.incFlash > 0) w.incFlash -= dt;
  }
  // Bases shoot the nearest hostile unit within 36.
  for (const s of w.slots)
    for (const b of s.settlements) {
      if (b.hp <= 0) continue;
      b.cd -= dt;
      if (b.cd > 0) continue;
      let tg: Unit | null = null, bd = 36;
      for (const u of w.units) {
        if (allied(w, u.team, b.team) || u.hp <= 0 || !unitVisible(u)) continue;
        const d = Math.hypot(u.x - b.x, u.y - b.y);
        if (d < bd) { bd = d; tg = u; }
      }
      if (tg) { b.cd = 0.45; w.fx.push({ k: 'shot', x1: b.x, y1: b.y - 8, x2: tg.x, y2: tg.y - 2, t: 0.1, c: '#ffffff' }); damage(w, tg, 8); }
    }
  // Towers.
  for (const b of w.blds) {
    if (b.kind !== 'tower' || b.hp <= 0) continue;
    b.cd -= dt;
    if (b.cd > 0) continue;
    const D = BLD[b.type];
    let tg: Unit | null = null, bd = D.range!;
    for (const u of w.units) {
      if (allied(w, u.team, b.team) || u.hp <= 0 || !unitVisible(u)) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d < bd) { bd = d; tg = u; }
    }
    if (tg) { b.cd = D.cd!; w.fx.push({ k: 'shot', x1: b.x, y1: b.y - 6, x2: tg.x, y2: tg.y - 2, t: 0.1, c: TEAM[b.team] }); damage(w, tg, D.dmg!); }
  }
  // Barbed wire ticks twice a second.
  w.barbT += dt;
  const barbTick = w.barbT >= 0.5;
  if (barbTick) w.barbT -= 0.5;
  const W = mapW(w), H = mapH(w);
  for (const u of w.units) {
    if (u.hp <= 0) continue;
    const T = TYPES[u.type];
    u.cd -= dt;
    u.flash = Math.max(0, u.flash - dt);
    u.blk = null;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.rootT > 0) u.rootT -= dt;
    if (u.reveal > 0) u.reveal -= dt;
    if (u.blinkT > 0) u.blinkT -= dt;
    const onTree = tileAt(w.map, u.x, u.y) === 2;
    if (T.regen) u.hp = Math.min(T.hp, u.hp + T.regen * dt * (T.treeArmor && onTree ? 2 : 1));
    if (T.stealth && u.reveal <= 0) {
      // Standing next to an enemy gives a shade away.
      for (const o of w.units) if (!allied(w, o.team, u.team) && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) < 10) { u.reveal = 1; break; }
    }
    if (T.dropTrap) {
      u.dropT -= dt;
      if (u.dropT <= 0) {
        u.dropT = T.dropTrap;
        const tx = (u.x / 8) | 0, ty = (u.y / 8) | 0;
        let n = 0;
        for (const b of w.blds) if (b.team === u.team) n++;
        if (n < BUILD_CAP && !canBuild(w, tx, ty, u.team, 'brb')) addBld(w, u.team, 'brb', tx, ty);
      }
    }
    let slow = u.slowT > 0 ? 0.5 : 1;
    if (u.rootT > 0) slow = 0;
    if (hasSpeedAura(w, u)) slow *= 1.3;
    if (!T.fly) {
      const bb = bldAtPx(w, u.x, u.y);
      if (bb && bb.kind === 'trap' && !allied(w, bb.team, u.team)) {
        slow = 0.4;
        if (barbTick) {
          u.hp -= 2; u.flash = 0.1; bb.hp -= 1;
          if (bb.hp <= 0) removeBld(w, bb);
          if (u.hp <= 0) continue;
        }
      }
    }
    const foes = targetsFor(w, u.team);
    let tgt: Target | null = null, best = 1e9;
    for (const t of foes) { const d = edist(u, t); if (d < best) { best = d; tgt = t; } }
    let mv: Vec = null;
    if (T.repair) {
      // Workers seek the nearest damaged friendly building or base within 70.
      let tb: Target | null = null, tbd = 70;
      for (const b2 of w.blds) {
        if (b2.team !== u.team || b2.hp >= b2.max) continue;
        const d = Math.hypot(b2.x - u.x, b2.y - u.y);
        if (d < tbd) { tbd = d; tb = b2; }
      }
      const hb = primaryBase(w, u.team);
      if (hb.hp < hb.max && hb.hp > 0) { const d = Math.hypot(hb.x - u.x, hb.y - u.y); if (d < tbd) { tbd = d; tb = hb; } }
      if (u.order) mv = moveLogic(w, u, T, tgt, best);
      else if (tb && tbd > 11) mv = dirTo(u, tb);
      else if (!tb) mv = moveLogic(w, u, T, tgt, best);
      if (u.cd <= 0) {
        if (tb && tbd <= 14 && payRepair(w, u.team, 0.5)) {
          u.cd = T.cd;
          tb.hp = Math.min(tb.max, tb.hp + T.repair);
          w.fx.push({ k: 'fix', x: tb.x + rnd(w.fxRng, -3, 3), y: tb.y - 5, t: 0.25 });
        } else if (tgt && best <= T.range) { u.cd = T.cd; attack(w, u, tgt, T); }
      }
    } else if (T.heal) {
      // Medics favor close, badly hurt allies.
      let ally: Unit | null = null, ab = 1e9;
      for (const o of w.units) {
        if (!allied(w, o.team, u.team) || o === u || o.hp <= 0) continue;
        const M = TYPES[o.type].hp;
        if (o.hp >= M) continue;
        const d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d > T.aggro) continue;
        const sc = d * (0.3 + o.hp / M);
        if (sc < ab) { ab = sc; ally = o; }
      }
      if (u.order && u.order.type === 'move') mv = moveLogic(w, u, T, tgt, best);
      else if (ally && Math.hypot(ally.x - u.x, ally.y - u.y) > 14) mv = dirTo(u, ally);
      else mv = moveLogic(w, u, T, tgt, best);
      if (u.cd <= 0 && ally && Math.hypot(ally.x - u.x, ally.y - u.y) <= 22) {
        u.cd = T.cd;
        ally.hp = Math.min(TYPES[ally.type].hp, ally.hp + T.heal);
        w.fx.push({ k: 'heal', x: ally.x, y: ally.y - 7, t: 0.3 });
      }
    } else {
      mv = moveLogic(w, u, T, tgt, best);
      if (u.cd <= 0) {
        let at: Target | null = null;
        if (u.order && u.order.type === 'attack' && u.order.tgt && u.order.tgt.hp > 0) {
          const d = edist(u, u.order.tgt);
          if (d <= T.range && d >= (T.minRange || 0)) at = u.order.tgt;
        }
        if (!at) {
          if (T.minRange) {
            let bb2 = 1e9;
            for (const t of foes) { const d = edist(u, t); if (d >= T.minRange && d <= T.range && d < bb2) { bb2 = d; at = t; } }
          } else if (tgt && best <= T.range) at = tgt;
        }
        if (at) { u.cd = T.cd; attack(w, u, at, T); }
      }
    }
    if (T.blink && u.blinkT <= 0 && tgt && best > T.range && best < T.aggro) {
      // Sprites hop most of the gap when a target is in reach but out of range.
      const d = dirTo(u, tgt), hop = Math.min(T.blink, best - T.range + 2);
      const nx = u.x + d[0] * hop, ny = u.y + d[1] * hop;
      if (nx > 4 && ny > 4 && nx < W - 4 && ny < H - 4 && (T.fly || passableFor(w, u.team, nx, ny))) {
        w.fx.push({ k: 'ping', x: u.x, y: u.y, t: 0.3 });
        u.x = nx; u.y = ny; u.ox = nx; u.oy = ny; u.blinkT = 4;
        mv = null;
      }
    }
    u.moving = !!mv && slow > 0;
    if (mv && u.hp > 0 && slow > 0) {
      const sp = T.speed * dt * slow * (!T.fly && !T.woodland && onTree ? 0.5 : 1);
      const bx = u.x, by = u.y;
      u.blk = tryMove(w, u, mv, sp, T.fly);
      u.run += Math.hypot(u.x - bx, u.y - by);
      u.walk += dt;
    }
    // Bump-attack whatever stopped the move.
    if (u.blk && u.blk.hp > 0 && u.cd <= 0 && !T.heal) {
      const d = edist(u, u.blk);
      if (d <= Math.max(T.range, 8)) { u.cd = T.cd; attack(w, u, u.blk, T); }
    }
  }
  // Separation, pairwise. M4 replaces this with a spatial hash.
  const us = w.units;
  for (const u of us) { u.px = u.x; u.py = u.y; }
  for (let i = 0; i < us.length; i++)
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j], min = TYPES[a.type].r + TYPES[b.type].r;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < min) {
        if (d < 0.01) { dx = rand(w.rng) - 0.5; dy = rand(w.rng) - 0.5; d = Math.hypot(dx, dy) || 1; }
        const p = (min - d) * 0.3;
        dx /= d; dy /= d;
        a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p;
      }
    }
  for (const u of us) {
    u.x = clamp(u.x, 4, W - 4);
    u.y = clamp(u.y, 4, H - 4);
    if (!TYPES[u.type].fly && !passableFor(w, u.team, u.x, u.y)) { u.x = u.px; u.y = u.py; }
  }
  const dead = us.filter((u) => u.hp <= 0);
  for (const u of dead) w.fx.push({ k: 'die', x: u.x, y: u.y, t: 0.35 });
  if (dead.length) onDeaths(w, dead);
  w.units = w.units.filter((u) => u.hp > 0);
  for (const f of w.fx) f.t -= dt;
  w.fx = w.fx.filter((f) => f.t > 0);
  if (w.msgT > 0) w.msgT -= dt;
}
