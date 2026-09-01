// Every player, bot, and AI action is a Command: {tick, slot, type, payload}.
// applyCommand is the only way anything outside the step function changes the world.

import { BLD, BUILD_CAP } from '../data/buildings.ts';
import { TNAME } from '../data/teams.ts';
import { TYPES } from '../data/units.ts';
import { addBld, bldAtPx, canBuild, gateDir, passableFor, removeBld } from './buildings.ts';
import { clamp, TILE } from './map.ts';
import type { Action, Command, Target, TargetRef, Unit, World } from './types.ts';
import { buildTime, mkUnit } from './units.ts';
import { absorb, ADVANCED_COST, choose, canAbsorb, canSettle, hasCity, NEXT_TIER, placeSettlement, popCap, popUsed, setTruce, startUpgrade, TIERS, truceAccepted } from './conquest.ts';
import { popOf } from './units.ts';
import { castPower } from './powers.ts';
import { canResearch, canTrain, pickTrainer, queuedCount, RESEARCH_COST, TECH_NAMES } from './town.ts';
import { allied, count, mapH, mapW, say as worldSay } from './world.ts';

/** Queued and in-production units count toward the army cap. */
export function committed(w: World, slot: number): number {
  return count(w, slot) + queuedCount(w, slot);
}

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
      if (committed(w, slot) >= w.cap) { say('Army cap reached (' + w.cap + ')', 1.5); return false; }
      const why = canTrain(w, slot, c.payload.unit);
      if (why) { say(T.name + ' ' + why, 1.5); return false; }
      const trainer = pickTrainer(w, slot, c.payload.unit);
      const queue = trainer ? trainer.queue : s.queue;
      if (queue.length >= 12) { say('Queue is full', 1.2); return false; }
      if (w.mode === 'conquest' && w.rules.population && popUsed(w, slot) + popOf(c.payload.unit) > popCap(w, slot)) { say('No room. Houses and settlements add population.', 1.5); return false; }
      if (w.mode === 'conquest' && !w.rules.town && T.cost >= ADVANCED_COST && !hasCity(w, slot)) { say('Needs a city', 1.5); return false; }
      s.gold -= T.cost;
      queue.push({ unit: c.payload.unit, t: buildTime(c.payload.unit), held: !!c.payload.held });
      say(T.name + ' queued' + (trainer ? ' at the ' + BLD[trainer.type].name.toLowerCase() : ''), 0.8);
      return true;
    }
    case 'cancel': {
      const bld = c.payload.building != null ? w.blds.find((b) => b.id === c.payload.building && b.team === slot) : null;
      const queue = bld ? bld.queue : s.queue;
      const q = queue[c.payload.index];
      if (!q) return false;
      queue.splice(c.payload.index, 1);
      s.gold += TYPES[q.unit].cost;
      say(TYPES[q.unit].name + ' cancelled, gold refunded', 1);
      return true;
    }
    case 'research': {
      const why = canResearch(w, slot, c.payload.tech);
      if (why) { say('Cannot research: ' + why, 1.5); return false; }
      const lvl = s.tech[c.payload.tech];
      s.gold -= RESEARCH_COST[lvl];
      s.tech[c.payload.tech] = lvl + 1;
      say(TECH_NAMES[c.payload.tech] + ' ' + (lvl + 1) + ' researched', 2);
      return true;
    }
    case 'ageUp': {
      // Grow the best settlement one tier. Same as upgrade, without picking a building.
      const best = s.settlements.filter((b) => b.hp > 0 && b.buildT <= 0 && NEXT_TIER[b.tier]).sort((a, b) => (b.tier === 'town' ? 1 : 0) - (a.tier === 'town' ? 1 : 0))[0];
      if (!best) { say('No settlement can grow right now', 1.5); return false; }
      return applyCommand(w, { ...c, type: 'upgrade', payload: { id: best.id } } as Command, quiet);
    }
    case 'bldRally': {
      const b = w.blds.find((x) => x.id === c.payload.id && x.team === slot);
      if (!b) return false;
      b.rally = { x: clamp(c.payload.x, 4, mapW(w) - 4), y: clamp(c.payload.y, 4, mapH(w) - 4) };
      say('Rally point set for the ' + BLD[b.type].name.toLowerCase(), 1);
      return true;
    }
    case 'choose': {
      if (slot !== 0) return false;
      return choose(w, c.payload.yes);
    }
    case 'cheats': {
      w.cheats = { ...c.payload };
      if (w.cheats.gold) s.gold = Infinity; else if (!Number.isFinite(s.gold)) s.gold = 500;
      say('Cheats ' + (Object.values(w.cheats).some(Boolean) ? 'on' : 'off'), 1.5);
      return true;
    }
    case 'settle': {
      if (w.mode !== 'conquest') return false;
      const tier = c.payload.tier ?? 'village', T = TIERS[tier];
      const why = canSettle(w, slot, c.payload.x, c.payload.y);
      if (why) { say('Cannot settle: ' + why, 1.5); return false; }
      const mat = w.rules.materials ? T.mat : 0;
      if (s.gold < T.gold) { say('Need ' + T.gold + ' gold', 1.2); return false; }
      if (s.mat < mat) { say('Need ' + mat + ' materials', 1.2); return false; }
      s.gold -= T.gold;
      s.mat -= mat;
      const b = placeSettlement(w, slot, c.payload.x, c.payload.y, tier);
      say((tier === 'outpost' ? 'Outpost' : 'Village') + ' founded in ' + w.regions[b.region].name + '. Hold it 30s to claim.', 2.5);
      return true;
    }
    case 'upgrade': {
      if (w.mode !== 'conquest') return false;
      const b = s.settlements.find((x) => x.id === c.payload.id);
      const to = b ? NEXT_TIER[b.tier] : undefined;
      if (!b || b.hp <= 0 || !to || b.buildT > 0) { say('Pick a finished settlement of yours that can grow', 1.2); return false; }
      const T = TIERS[to], mat = w.rules.materials ? T.mat : 0;
      if (s.gold < T.gold) { say('Need ' + T.gold + ' gold', 1.2); return false; }
      if (s.mat < mat) { say('Need ' + mat + ' materials', 1.2); return false; }
      s.gold -= T.gold;
      s.mat -= mat;
      startUpgrade(b, to);
      say('Upgrading to a ' + to + '. It is weak until done.', 2.5);
      return true;
    }
    case 'absorb': {
      if (w.mode !== 'conquest' || w.neutral < 0) return false;
      const b = w.slots[w.neutral].settlements.find((x) => x.id === c.payload.id);
      if (!b) return false;
      const why = canAbsorb(w, slot, b);
      if (why) { say('Cannot absorb: ' + why, 1.5); return false; }
      if (s.gold < 200) { say('Need 200 gold', 1.2); return false; }
      s.gold -= 200;
      absorb(w, slot, b);
      say(w.regions[b.region].name + ' joins you with its buildings intact', 2.5);
      return true;
    }
    case 'truce': {
      if (w.mode !== 'conquest' || !w.rules.diplomacy) return false;
      const other = c.payload.slot;
      if (other === slot || !w.slots[other] || w.slots[other].neutral) return false;
      if (!c.payload.offer) { if (!s.truce[other]) return false; setTruce(w, slot, other, false); return true; }
      if (s.truce[other]) return false;
      const value = w.slots.map(() => 0);
      for (const u of w.units) if (u.hp > 0) value[u.team] += TYPES[u.type].cost;
      if (!truceAccepted(w, slot, other, value)) { say('They refuse. Come back stronger or less hated.', 2.5); return false; }
      setTruce(w, slot, other, true);
      return true;
    }
    case 'power': {
      if (editing) return false;
      const why = castPower(w, slot, c.payload.power, c.payload.x, c.payload.y);
      if (why) { say(why, 1.5); return false; }
      return true;
    }
    case 'rally': {
      if (!c.payload) { s.rally = null; say('Rally point cleared', 1); return true; }
      s.rally = { x: clamp(c.payload.x, 4, mapW(w) - 4), y: clamp(c.payload.y, 4, mapH(w) - 4) };
      say('Rally point set', 1);
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
      const dest = c.payload.x !== undefined && c.payload.y !== undefined ? { x: clamp(c.payload.x, 4, mapW(w) - 4), y: clamp(c.payload.y, 4, mapH(w) - 4) } : null;
      us.forEach((u, i) => {
        const o: import('./types.ts').Order = { type: 'attack', tgt };
        if (dest && !tgt) { const a = i * 2.4, r = Math.sqrt(i) * 3.4; o.x = clamp(dest.x + Math.cos(a) * r, 4, mapW(w) - 4); o.y = clamp(dest.y + Math.sin(a) * r, 4, mapH(w) - 4); }
        u.order = o;
      });
      if (dest && !tgt) w.fx.push({ k: 'mark', x: dest.x, y: dest.y, r: 6, t: 0.5, c: '#ff9a9a' });
      say(tgt ? 'Attacking' : dest ? 'Attack-moving' : 'Charge!', 1);
      return true;
    }
    case 'guard': {
      const us = ownUnits(w, slot, c.payload.ids);
      if (!us.length) return false;
      const W = mapW(w), H = mapH(w), { x, y } = c.payload;
      us.forEach((u, i) => {
        const a = i * 2.4, r = Math.sqrt(i) * 3.4;
        u.order = { type: 'guard', x: clamp(x + Math.cos(a) * r, 4, W - 4), y: clamp(y + Math.sin(a) * r, 4, H - 4) };
      });
      w.fx.push({ k: 'mark', x, y, r: 6, t: 0.5, c: '#7dff7d' });
      say('Guarding', 1);
      return true;
    }
    case 'hold': {
      for (const u of ownUnits(w, slot, c.payload.ids)) u.order = null;
      say('Holding', 1);
      return true;
    }
    case 'retreat': {
      const us = ownUnits(w, slot, c.payload.ids);
      if (!us.length) return false;
      for (const u of us) u.order = { type: 'retreat' };
      say('Falling back', 1);
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
      const D0 = BLD[bld];
      // Conquest: walls and towers cost materials, town buildings cost gold, the castle both.
      const matCost = w.mode === 'conquest' && w.rules.materials && !w.cheats.resources ? (D0.town ? D0.mat ?? 0 : D0.cost) : 0;
      const goldCost = !w.mode.startsWith('conq') ? D0.cost : D0.town ? D0.cost : 0;
      if (matCost && s.mat < matCost) { say('Need ' + matCost + ' materials', 1); return false; }
      const D = BLD[bld];
      // The tap is the footprint's center.
      const tx = clamp(Math.round(x / TILE - D.w / 2), 0, m.cols - 1), ty = clamp(Math.round(y / TILE - D.h / 2), 0, m.rows - 1);
      const gdir = D.kind === 'gate' ? gateDir(w, tx, ty) : null;
      const why = canBuild(w, tx, ty, slot, bld, gdir);
      if (why) { say('Cannot build: ' + why, 1); return false; }
      let n = 0;
      for (const b of w.blds) if (b.team === slot) n++;
      if (n >= BUILD_CAP) { say('Build cap is ' + BUILD_CAP + ' per team', 1.2); return false; }
      if (!editing) {
        if (goldCost && s.gold < goldCost) { say('Need ' + goldCost + ' gold', 1); return false; }
        if (matCost) s.mat -= matCost;
        if (goldCost) s.gold -= goldCost;
      }
      const nb = addBld(w, slot, bld, tx, ty, gdir, w.rules.town && !editing);
      if (nb.buildT > 0) say(D.name + ' under construction. Workers nearby speed it up.', 1.5);
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
