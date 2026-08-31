// Every player, bot, and AI action is a Command: {tick, slot, type, payload}.
// applyCommand is the only way anything outside the step function changes the world.

import { BLD, BUILD_CAP } from '../data/buildings.ts';
import { TNAME } from '../data/teams.ts';
import { TYPES } from '../data/units.ts';
import { addBld, bldAtPx, canBuild, gateDir, passableFor, removeBld } from './buildings.ts';
import { clamp, TILE } from './map.ts';
import type { Action, Command, Target, TargetRef, Unit, World } from './types.ts';
import { mkUnit, spawn } from './units.ts';
import { allied, count, mapH, mapW, say as worldSay } from './world.ts';

export function resolveRef(w: World, r: TargetRef | null): Target | null {
  if (!r) return null;
  if (r.kind === 'unit') return w.units.find((u) => u.id === r.id && u.hp > 0) ?? null;
  if (r.kind === 'bld') return w.blds.find((b) => b.id === r.id) ?? null;
  for (const s of w.slots) for (const b of s.settlements) if (b.id === r.id) return b;
  return null;
}

export function refOf(t: Target): TargetRef {
  return { kind: t.ent, id: t.id };
}

function ownUnits(w: World, slot: number, ids: number[]): Unit[] {
  const set = new Set(ids);
  return w.units.filter((u) => u.team === slot && u.hp > 0 && set.has(u.id));
}

/** Build a command stamped for the next tick. */
export function cmd(w: World, slot: number, a: Action): Command {
  return { tick: w.tick, slot, ...a } as Command;
}

/**
 * Apply one command now. Returns false when it was refused. `quiet` suppresses
 * player-facing messages, which the AI uses so its purchases do not spam the HUD.
 */
export function applyCommand(w: World, c: Command, quiet = false): boolean {
  const say = (t: string, d?: number): void => { if (!quiet) worldSay(w, t, d); };
  const slot = c.slot, s = w.slots[slot];
  if (!s) return false;
  const editing = w.mode === 'sand' && w.phase === 'edit';
  switch (c.type) {
    case 'buy': {
      if (editing) return false;
      const T = TYPES[c.payload.unit];
      if (s.gold < T.cost) { say('Need ' + T.cost + ' gold', 1.2); return false; }
      if (!spawn(w, slot, c.payload.unit)) { say('Army cap reached (' + w.cap + ')', 1.5); return false; }
      s.gold -= T.cost;
      say(T.name + ' ready', 1);
      return true;
    }
    case 'move': {
      const us = ownUnits(w, slot, c.payload.ids);
      if (!us.length) return false;
      const W = mapW(w), H = mapH(w), { x, y } = c.payload;
      us.forEach((u, i) => {
        const a = i * 2.4, r = Math.sqrt(i) * 3.4;
        u.order = { type: 'move', x: clamp(x + Math.cos(a) * r, 4, W - 4), y: clamp(y + Math.sin(a) * r, 4, H - 4) };
      });
      w.fx.push({ k: 'ping', x, y, t: 0.4 });
      return true;
    }
    case 'attack': {
      const us = ownUnits(w, slot, c.payload.ids);
      if (!us.length) return false;
      const tgt = resolveRef(w, c.payload.target);
      if (c.payload.target && (!tgt || allied(w, tgt.team, slot))) return false;
      for (const u of us) u.order = { type: 'attack', tgt };
      say(tgt ? 'Attacking' : 'Charge!', 1);
      return true;
    }
    case 'hold': {
      for (const u of ownUnits(w, slot, c.payload.ids)) u.order = null;
      say('Holding', 1);
      return true;
    }
    case 'gate': {
      const gb = w.blds.find((b) => b.id === c.payload.id);
      if (!gb || gb.kind !== 'gate' || gb.team !== slot) return false;
      gb.locked = !gb.locked;
      w.flowDirty = true;
      say(gb.locked ? 'Gate locked' : 'Gate open', 1.2);
      return true;
    }
    case 'build': {
      const { x, y, bld } = c.payload, m = w.map;
      const tx = clamp((x / TILE) | 0, 0, m.cols - 1), ty = clamp((y / TILE) | 0, 0, m.rows - 1);
      const D = BLD[bld], gdir = D.kind === 'gate' ? gateDir(w, tx, ty) : null;
      const why = canBuild(w, tx, ty, slot, bld, gdir);
      if (why) { say('Cannot build: ' + why, 1); return false; }
      let n = 0;
      for (const b of w.blds) if (b.team === slot) n++;
      if (n >= BUILD_CAP) { say('Build cap is ' + BUILD_CAP + ' per team', 1.2); return false; }
      if (!editing) {
        if (s.gold < D.cost) { say('Need ' + D.cost + ' gold', 1); return false; }
        s.gold -= D.cost;
      }
      addBld(w, slot, bld, tx, ty, gdir);
      return true;
    }
    case 'sell': {
      const b = bldAtPx(w, c.payload.x, c.payload.y);
      if (!b || b.team !== slot) { say('Tap one of your buildings', 1); return false; }
      removeBld(w, b);
      if (w.mode !== 'sand') s.gold += Math.floor(BLD[b.type].cost / 2);
      say('Sold ' + BLD[b.type].name, 0.8);
      return true;
    }
    case 'place': {
      if (!editing) return false;
      let { x, y } = c.payload;
      if (count(w, slot) >= w.cap) { say('Cap is ' + w.cap + ' per team', 1.2); return false; }
      x = clamp(x, 4, mapW(w) - 4);
      y = clamp(y, 4, mapH(w) - 4);
      if (!passableFor(w, slot, x, y) && !TYPES[c.payload.unit].fly) { say('Blocked ground', 1); return false; }
      w.units.push(mkUnit(w, slot, c.payload.unit, x, y));
      return true;
    }
    case 'erase': {
      if (!editing) return false;
      const { x, y } = c.payload;
      let b: Unit | null = null, bd = 7;
      for (const u of w.units) { const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; b = u; } }
      if (b) { w.units = w.units.filter((u) => u !== b); return true; }
      const bl = bldAtPx(w, x, y);
      if (bl) { removeBld(w, bl); return true; }
      return false;
    }
    case 'clear': {
      if (!editing) return false;
      w.units = [];
      w.blds = [];
      w.bmap.clear();
      w.flowDirty = true;
      say('Map cleared', 1);
      return true;
    }
    case 'mirror': {
      if (!editing) return false;
      mirror(w, slot, say);
      return true;
    }
    case 'startBattle': {
      if (w.mode !== 'sand') return false;
      if (w.phase === 'edit') {
        if (!w.units.length && !w.blds.length) { say('Place some units first', 1.5); return false; }
        takeSnap(w);
      }
      w.phase = 'play';
      w.over = null;
      w.fx = [];
      restoreSnap(w);
      for (const u of w.units) u.order = { type: 'attack', tgt: null };
      for (const sl of w.slots) { sl.alive = true; for (const b of sl.settlements) b.hp = b.max; }
      w.t = 0;
      say('Fight. Tap units to take command.', 2.5);
      return true;
    }
    case 'toEdit': {
      if (w.mode !== 'sand') return false;
      w.phase = 'edit';
      w.over = null;
      w.fx = [];
      if (w.snap) restoreSnap(w);
      for (const sl of w.slots) { sl.alive = true; for (const b of sl.settlements) b.hp = b.max; }
      say('Edit armies and defenses, then hit PLAY', 2);
      return true;
    }
  }
  return false;
}

/** Point-mirror one side's units and buildings onto the other side. */
function mirror(w: World, me: number, say: (t: string, d?: number) => void): void {
  const other = 1 - me, src = w.units.filter((u) => u.team === me), sb = w.blds.filter((b) => b.team === me);
  if (!src.length && !sb.length) { say('Nothing to mirror for ' + TNAME[me], 1.2); return; }
  const W = mapW(w), H = mapH(w);
  w.units = w.units.filter((u) => u.team === me);
  for (const b of w.blds.filter((b) => b.team === other)) removeBld(w, b);
  for (const u of src) {
    const x = W - u.x, y = H - u.y;
    if (passableFor(w, other, x, y) || TYPES[u.type].fly) w.units.push(mkUnit(w, other, u.type, x, y));
  }
  for (const b of sb) {
    let tx = w.map.cols - 1 - b.tx, ty = w.map.rows - 1 - b.ty;
    if (b.kind === 'gate') { if (b.dir === 'h') tx -= 1; else ty -= 1; }
    if (!canBuild(w, tx, ty, other, b.type, b.dir)) {
      const nb = addBld(w, other, b.type, tx, ty, b.dir);
      if (b.locked === false) nb.locked = false;
    }
  }
  say(TNAME[other] + ' now mirrors ' + TNAME[me], 1.5);
}

function takeSnap(w: World): void {
  w.snap = {
    units: w.units.map((u) => ({ team: u.team, type: u.type, x: u.x, y: u.y })),
    blds: w.blds.map((b) => ({ team: b.team, type: b.type, tx: b.tx, ty: b.ty, dir: b.dir, locked: b.locked })),
  };
}

function restoreSnap(w: World): void {
  if (!w.snap) return;
  w.units = w.snap.units.map((s) => mkUnit(w, s.team, s.type, s.x, s.y));
  w.blds = [];
  w.bmap.clear();
  w.flowDirty = true;
  for (const s of w.snap.blds) {
    const nb = addBld(w, s.team, s.type, s.tx, s.ty, s.dir);
    if (s.locked === false) nb.locked = false;
  }
}

/** Apply a command right now and log it. Same result as queuing it for the current tick. */
export function issue(w: World, c: Command, quiet = false): boolean {
  const ok = applyCommand(w, c, quiet);
  w.log.push(c);
  return ok;
}

/** Apply every queued command due on or before this tick, in queue order, and log it. */
export function drainQueue(w: World): void {
  if (!w.queue.length) return;
  const rest: Command[] = [];
  for (const c of w.queue) {
    if (c.tick <= w.tick) { applyCommand(w, c); w.log.push(c); }
    else rest.push(c);
  }
  w.queue = rest;
}
