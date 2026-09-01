// The per-tick update. Order matches the prototype. Every scan over units goes through the
// spatial hash, which is rebuilt at the top of the unit phase.

import { BLD, BUILD_CAP } from '../data/buildings.ts';
import { TEAM } from '../data/teams.ts';
import { TYPES, unitVisible, type UnitDef } from '../data/units.ts';
import { aiTick, PROFILES } from './ai/index.ts';
import { addBld, bldAtPx, canBuild, passableFor, removeBld } from './buildings.ts';
import { attack, auraTeams, buildTargetCache, damage, dirTo, edist, hasSpeedAura, nearestHostile, type TargetCache } from './combat.ts';
import { drainQueue } from './commands.ts';
import { dominationTick, hasEconomy, incomeTick, mineTick, minesHeld, payRepair } from './economy.ts';
import { clamp, tileAt } from './map.ts';
import { computeFlow, computeHome, flowDir } from './pathing.ts';
import { conquestTick, grossIncome } from './conquest.ts';
import { powersTick } from './powers.ts';
import { townTick } from './town.ts';
import { civTick, isCiv } from './civ.ts';
import { visionTick } from './vision.ts';
import { rand, rnd } from './rng.ts';
import { fillGrid, forNear, gridOf, nearestHostileWithin } from './spatial.ts';
import type { Building, Target, Unit, World } from './types.ts';
import { allied, count, DT, mapH, mapW, primaryBase } from './world.ts';
import { maxHp, mkUnit, spawn } from './units.ts';

type Vec = [number, number] | null;

/** Flow fields rebuild at most once every 15 ticks, and right away when none exist yet. */
const FLOW_EVERY = 15;

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
    const found = { u: null as Unit | null, d: Infinity };
    forNear(gridOf(w), d.x, d.y, 30, (o) => {
      const R = TYPES[o.type].raise;
      if (!R || o.hp <= 0 || allied(w, o.team, d.team)) return;
      const dist = Math.hypot(o.x - d.x, o.y - d.y);
      if (dist <= R && (dist < found.d || (dist === found.d && found.u && o.ix < found.u.ix))) { found.d = dist; found.u = o; }
    });
    const nec = found.u;
    if (nec && count(w, nec.team) < w.cap && passableFor(w, nec.team, d.x, d.y)) {
      const sk = mkUnit(w, nec.team, 'u_inf', d.x, d.y);
      sk.order = nec.order && nec.order.type === 'attack' ? { type: 'attack', tgt: null } : null;
      w.units.push(sk);
      w.fx.push({ k: 'heal', x: d.x, y: d.y - 7, t: 0.3 });
    }
  }
}

/** Production: the head of each slot's queue builds down, then spawns and walks to the rally point. */
function produce(w: World, dt: number): void {
  for (let i = 0; i < w.nP; i++) {
    const s = w.slots[i];
    if (!s.alive || !s.queue.length) continue;
    let rate = s.ai ? PROFILES[s.diff].build : 1;
    if (w.mode === 'conquest') {
      const producers = s.settlements.filter((b) => b.hp > 0 && b.tier !== 'outpost' && b.tier !== 'ruin' && b.tier !== 'camp');
      if (!producers.length) continue;
      // A settlement mid-upgrade builds at half speed.
      if (!producers.some((b) => b.buildT <= 0)) rate *= 0.5;
    }
    const q = s.queue[0];
    q.t -= w.instant || w.cheats.instant ? 1e9 : dt * rate;
    if (q.t > 0) continue;
    const u = spawn(w, i, q.unit);
    if (!u) { q.t = 0.5; continue; }
    s.queue.shift();
    u.held = q.held;
    if (s.rally && !q.held) u.order = { type: 'move', x: s.rally.x, y: s.rally.y };
    if (i === 0) w.fx.push({ k: 'txt', x: u.x, y: u.y - 8, t: 0.9, str: TYPES[q.unit].name, c: TEAM[i] });
  }
}

/** Units near a living friendly settlement heal, faster with a worker or medic close by. */
function healAtHome(w: World, dt: number): void {
  const grid = gridOf(w);
  for (let i = 0; i < w.nP; i++) {
    for (const b of w.slots[i].settlements) {
      if (b.hp <= 0) continue;
      let helper = false;
      forNear(grid, b.x, b.y, 40, (o) => { if (!helper && o.team === i && o.hp > 0 && (TYPES[o.type].repair || TYPES[o.type].heal) && Math.hypot(o.x - b.x, o.y - b.y) <= 40) helper = true; });
      const rate = (helper ? 2.5 : 1) * dt;
      forNear(grid, b.x, b.y, 40, (o) => {
        if (o.team !== i || o.hp <= 0 || o.moving) return;
        const M = maxHp(o);
        if (o.hp < M && Math.hypot(o.x - b.x, o.y - b.y) <= 40) o.hp = Math.min(M, o.hp + rate);
      });
    }
  }
}

/** Retreating units head for the base by the shortest terrain path and stop near it. */
function retreatDir(w: World, u: Unit): Vec {
  const b = primaryBase(w, u.team);
  const d = Math.hypot(b.x - u.x, b.y - u.y);
  if (d < 22) { u.order = null; return null; }
  const f = w.home ? homeDir(w, u) : null;
  return f ?? dirTo(u, b);
}

/** Direction along the slot's home field (distance to own base). */
function homeDir(w: World, u: Unit): Vec {
  const m = w.map, D = w.home![u.team];
  if (!D) return null;
  const tx = clamp((u.x / 8) | 0, 0, m.cols - 1), ty = clamp((u.y / 8) | 0, 0, m.rows - 1);
  const here = D[ty * m.cols + tx];
  let bx = tx, by = ty, bd = here;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= m.cols || ny >= m.rows) continue;
      const d = D[ny * m.cols + nx];
      if (d < bd) { bd = d; bx = nx; by = ny; }
    }
  if (bd >= here) return null;
  return dirTo(u, { x: bx * 8 + 4, y: by * 8 + 4 });
}

function moveLogic(w: World, u: Unit, T: UnitDef, tgt: Target | null, best: number): Vec {
  if (u.order && u.order.type === 'retreat') return retreatDir(w, u);
  if (u.order && u.order.type === 'move') {
    const dx = u.order.x - u.x, dy = u.order.y - u.y, d = Math.hypot(dx, dy);
    if (d < 2.5) { u.order = null; return null; }
    return [dx / d, dy / d];
  }
  if (u.order && u.order.type === 'guard') {
    // Guarding a target follows it. Chase what comes within reach, but not beyond the leash.
    const g = u.order;
    if (g.tgt) { if (g.tgt.hp <= 0) g.tgt = null; else { g.x = g.tgt.x + (g.x - g.tgt.x) * 0; g.y = g.tgt.y; } }
    const px = g.tgt ? g.tgt.x : g.x, py = g.tgt ? g.tgt.y : g.y;
    const leash = g.hold ? 28 : 56;
    const offPost = Math.hypot(u.x - px, u.y - py);
    if (tgt && best < T.aggro && best > T.range && Math.hypot(tgt.x - px, tgt.y - py) < leash) return dirTo(u, tgt);
    const keep = g.tgt ? 12 : 3;
    if (offPost > keep && !(tgt && best <= T.range)) return dirTo(u, { x: px, y: py });
    return null;
  }
  if (u.order && u.order.type === 'attack') {
    let ct = u.order.tgt;
    if (ct && ct.hp <= 0) { ct = null; u.order.tgt = null; }
    if (!ct && u.order.x !== undefined && u.order.y !== undefined) {
      // Attack-move: fight what is within reach, otherwise keep walking to the point.
      if (tgt && best < T.aggro) { if (best <= T.range) return null; return dirTo(u, tgt); }
      const dx = u.order.x - u.x, dy = u.order.y - u.y, d = Math.hypot(dx, dy);
      if (d < 2.5) { u.order.x = undefined; u.order.y = undefined; return null; }
      return [dx / d, dy / d];
    }
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

/** Move, sliding along blockers. Returns the enemy building that stopped the move, if any. */
function tryMove(w: World, u: Unit, mv: [number, number], sp: number, fly: boolean | undefined): Building | null {
  const nx = u.x + mv[0] * sp, ny = u.y + mv[1] * sp;
  // A unit already standing on blocked ground (pushed there, or a building went up around it) may always step.
  if (fly || passableFor(w, u.team, nx, ny) || !passableFor(w, u.team, u.x, u.y)) { u.x = nx; u.y = ny; return null; }
  const b = bldAtPx(w, nx, ny);
  const blk = b && !allied(w, b.team, u.team) && b.kind !== 'trap' ? b : null;
  if (passableFor(w, u.team, nx, u.y)) { u.x = nx; return blk; }
  if (passableFor(w, u.team, u.x, ny)) u.y = ny;
  return blk;
}

/** Nearest visible hostile unit within `range` of a fixed shooter. */
function nearestInRange(w: World, x: number, y: number, team: number, range: number, tc: TargetCache): Unit | null {
  const list = tc.hostiles[team];
  if (list.length <= ((2 * range) / 16 + 1) ** 2) {
    let best: Unit | null = null, bd = range * range;
    for (let i = 0; i < list.length; i++) { const o = list[i]; const dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = o; } }
    return best;
  }
  const r = nearestHostileWithin(gridOf(w), x, y, range, tc.hostile[team], null, unitVisible);
  return r.u && Math.sqrt(r.d2) < range ? r.u : null;
}

export function step(w: World): void {
  drainQueue(w);
  if (w.over || w.phase !== 'play') { w.tick++; return; }
  const dt = DT;
  if (w.flowDirty && (w.flow === null || w.tick - w.flowTick >= FLOW_EVERY)) { computeFlow(w); computeHome(w); w.flowDirty = false; w.flowTick = w.tick; }
  w.tick++;
  w.t += dt;
  const grid = gridOf(w);
  w.units.forEach((u, i) => { u.ox = u.x; u.oy = u.y; u.ix = i; });
  fillGrid(grid, w.units);
  w.auras = auraTeams(w);
  const tc = buildTargetCache(w);
  const eco = hasEconomy(w);
  mineTick(w);
  const mcount = minesHeld(w);
  if (eco) {
    incomeTick(w, dt, mcount);
    if (w.mode === 'conquest') { conquestTick(w, dt, mcount); w.income = grossIncome(w, 0, mcount); }
    aiTick(w, dt);
    produce(w, dt);
  }
  if (w.phase === 'play') {
    powersTick(w, dt);
    townTick(w, dt);
    civTick(w);
    visionTick(w);
    if (w.cheats.gold) w.slots[0].gold = Infinity;
    if (w.cheats.resources) w.slots[0].mat = 99999;
    if (w.cheats.powers) w.slots[0].powerCd = {};
    if (w.mode === 'dom') { dominationTick(w, dt, mcount); if (w.over) return; }
    if (w.incFlash > 0) w.incFlash -= dt;
  }
  // Bases shoot the nearest hostile unit within 36.
  for (const s of w.slots)
    for (const b of s.settlements) {
      if (b.hp <= 0 || b.buildT > 0 || b.tier === 'ruin' || b.tier === 'outpost') continue;
      b.cd -= dt;
      if (b.cd > 0) continue;
      const fort = b.tier === 'fortress' || b.tier === 'city';
      const tg = nearestInRange(w, b.x, b.y, b.team, fort ? 44 : 36, tc);
      if (tg) { b.cd = fort ? 0.35 : 0.45; w.fx.push({ k: 'shot', x1: b.x, y1: b.y - 8, x2: tg.x, y2: tg.y - 2, t: 0.1, c: '#ffffff' }); damage(w, tg, fort ? 12 : 8); }
    }
  // Towers.
  for (const b of w.blds) {
    if (b.kind !== 'tower' || b.hp <= 0 || b.buildT > 0) continue;
    b.cd -= dt;
    if (b.cd > 0) continue;
    const D = BLD[b.type];
    const tg = nearestInRange(w, b.x, b.y, b.team, D.range!, tc);
    if (tg) { b.cd = D.cd!; w.fx.push({ k: 'shot', x1: b.x, y1: b.y - 6, x2: tg.x, y2: tg.y - 2, t: 0.1, c: TEAM[b.team] }); damage(w, tg, D.dmg!); }
  }
  // Damaged own buildings per slot, for workers.
  const statics = tc.statics, damaged: Building[][] = [];
  for (let i = 0; i < w.nP; i++) damaged.push([]);
  for (const b of w.blds) if (b.hp < b.max) damaged[b.team].push(b);
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
    if (u.hasteT > 0) { u.hasteT -= dt; u.cd -= dt * 0.5; }
    if (u.reveal > 0) u.reveal -= dt;
    if (u.blinkT > 0) u.blinkT -= dt;
    const onTree = tileAt(w.map, u.x, u.y) === 2;
    if (T.regen) u.hp = Math.min(maxHp(u), u.hp + T.regen * dt * (T.treeArmor && onTree ? 2 : 1));
    if (T.stealth && u.reveal <= 0) {
      // Standing next to an enemy gives a shade away.
      let seen = false;
      forNear(grid, u.x, u.y, 10, (o) => { if (!seen && !allied(w, o.team, u.team) && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) < 10) seen = true; });
      if (seen) u.reveal = 1;
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
    if (u.hasteT > 0) slow *= 1.5;
    if (!T.fly) {
      const bb = bldAtPx(w, u.x, u.y);
      if (bb && bb.kind === 'trap' && !allied(w, bb.team, u.team)) {
        slow *= 0.4;
        if (barbTick) {
          u.hp -= 2; u.flash = 0.1; bb.hp -= 1;
          if (bb.hp <= 0) removeBld(w, bb);
          if (u.hp <= 0) continue;
        }
      }
    }
    const { tgt, best } = nearestHostile(w, u, Math.max(T.aggro, T.range) + 8, tc);
    let mv: Vec = null;
    if (T.repair) {
      // Workers seek the nearest damaged friendly building or base within 70.
      let tb: Target | null = null, tbd = 70;
      for (const b2 of damaged[u.team]) {
        if (b2.hp >= b2.max) continue;
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
      const pick = { u: null as Unit | null, sc: 1e9 };
      forNear(grid, u.x, u.y, T.aggro, (o) => {
        if (!allied(w, o.team, u.team) || o === u || o.hp <= 0) return;
        const M = maxHp(o);
        if (o.hp >= M) return;
        const d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d > T.aggro) return;
        const sc = d * (0.3 + o.hp / M);
        if (sc < pick.sc || (sc === pick.sc && pick.u && o.ix < pick.u.ix)) { pick.sc = sc; pick.u = o; }
      });
      const ally = pick.u;
      if (u.order && u.order.type === 'move') mv = moveLogic(w, u, T, tgt, best);
      else if (ally && Math.hypot(ally.x - u.x, ally.y - u.y) > 14) mv = dirTo(u, ally);
      else mv = moveLogic(w, u, T, tgt, best);
      if (u.cd <= 0 && ally && Math.hypot(ally.x - u.x, ally.y - u.y) <= 22) {
        u.cd = T.cd;
        ally.hp = Math.min(maxHp(ally), ally.hp + T.heal);
        w.fx.push({ k: 'heal', x: ally.x, y: ally.y - 7, t: 0.3 });
      }
    } else if (isCiv(u)) {
      // Villagers only walk where the civilian pass sends them.
      mv = moveLogic(w, u, T, null, Infinity);
    } else {
      mv = moveLogic(w, u, T, tgt, best);
      const fleeing = !!u.order && u.order.type === 'retreat';
      if (u.cd <= 0 && !fleeing) {
        let at: Target | null = null;
        if (u.order && u.order.type === 'attack' && u.order.tgt && u.order.tgt.hp > 0) {
          const d = edist(u, u.order.tgt);
          if (d <= T.range && d >= (T.minRange || 0)) at = u.order.tgt;
        }
        if (!at) {
          if (T.minRange) {
            // Nearest target inside the ring [minRange, range].
            const ring = { t: null as Target | null, d: 1e9 };
            forNear(grid, u.x, u.y, T.range, (o) => {
              if (o.hp <= 0 || allied(w, o.team, u.team) || !unitVisible(o)) return;
              const d = Math.hypot(o.x - u.x, o.y - u.y);
              if (d >= T.minRange! && d <= T.range && (d < ring.d || (d === ring.d && ring.t && ring.t.ent === 'unit' && o.ix < ring.t.ix))) { ring.d = d; ring.t = o; }
            });
            for (const t of statics[u.team]) { const d = edist(u, t); if (d >= T.minRange && d <= T.range && d < ring.d) { ring.d = d; ring.t = t; } }
            at = ring.t;
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
    // Bump-attack whatever stopped the move. Retreating units keep walking.
    if (u.blk && u.blk.hp > 0 && u.cd <= 0 && !T.heal && !(u.order && u.order.type === 'retreat')) {
      const d = edist(u, u.blk);
      if (d <= Math.max(T.range, 8)) { u.cd = T.cd; attack(w, u, u.blk, T); }
    }
  }
  // Separation through the grid. Each pair is handled once, from the lower index.
  const us = w.units;
  for (const u of us) { u.px = u.x; u.py = u.y; }
  fillGrid(grid, us);
  for (const a of us) {
    const ra = TYPES[a.type].r;
    forNear(grid, a.x, a.y, ra + 5, (b) => {
      if (b.ix <= a.ix) return;
      const min = ra + TYPES[b.type].r;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < min) {
        if (d < 0.01) { dx = rand(w.rng) - 0.5; dy = rand(w.rng) - 0.5; d = Math.hypot(dx, dy) || 1; }
        const p = (min - d) * 0.3;
        dx /= d; dy /= d;
        a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p;
      }
    });
  }
  for (const u of us) {
    u.x = clamp(u.x, 4, W - 4);
    u.y = clamp(u.y, 4, H - 4);
    if (!TYPES[u.type].fly && !passableFor(w, u.team, u.x, u.y)) { u.x = u.px; u.y = u.py; }
  }
  healAtHome(w, dt);
  const dead = us.filter((u) => u.hp <= 0);
  for (const u of dead) w.fx.push({ k: 'die', x: u.x, y: u.y, t: 0.35 });
  if (dead.length) onDeaths(w, dead);
  w.units = w.units.filter((u) => u.hp > 0);
  for (const f of w.fx) f.t -= dt;
  w.fx = w.fx.filter((f) => f.t > 0);
  if (w.msgT > 0) w.msgT -= dt;
}
