// Every player, bot, and AI action is a Command: {tick, slot, type, payload}.
// applyCommand is the only way anything outside the step function changes the world.

import { BLD, BUILD_CAP } from '../data/buildings.ts';
import { TNAME } from '../data/teams.ts';
import { cleanName } from '../data/names.ts';
import { TYPES } from '../data/units.ts';
import { addBld, bldAtPx, canBuild, gateDir, passableFor, removeBld } from './buildings.ts';
import { clamp, TILE } from './map.ts';
import type { Action, Command, Settlement, Target, TargetRef, Unit, World } from './types.ts';
import { buildTime, mkUnit } from './units.ts';
import { absorb, ADVANCED_COST, allyAccepted, canGrow, choose, setPact, truceAccepted, canAbsorb, canSettle, hasCity, NEXT_TIER, placeSettlement, popCap, popUsed, setTruce, startUpgrade, TIERS, nameRegionFor, regionAt, settlementsIn, canCapture, capture, CAPTURE_COST } from './conquest.ts';
import { popOf } from './units.ts';
import { seedResidents } from './civ.ts';
import { wonderBegun, wonderDone } from './wonder.ts';
import { allied, cheat, chronicle, count, mapH, mapW, say as worldSay } from './world.ts';
import { runCheat } from './cheats.ts';
import { startWork, unroad } from './works.ts';
import { castPower } from './powers.ts';
import { canResearch, canTrain, pickTrainer, queuedCount, RESEARCH_COST, TECH_NAMES, canUpgradeBld, connectedSegments, nextType, upgradeCost, levelQueue } from './town.ts';

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
  return w.units.filter((u) => u.team === slot && u.hp > 0 && u.aboard < 0 && set.has(u.id));
}

/** Build a command stamped for the next tick. */
export function cmd(w: World, slot: number, a: Action): Command {
  return { tick: w.tick, slot, ...a } as Command;
}

/**
 * Apply one command now. Returns false when it was refused. `quiet` suppresses
 * player-facing messages, which the AI uses so its purchases do not spam the HUD.
 */
/**
 * Mixed groups keep a loose order without a formation: ranged and support units stop a little
 * short of the point, siege shorter still, so the melee arrive first. Returns the per-unit pullback.
 */
function lineBack(us: readonly Unit[], x: number, y: number): (u: Unit) => { x: number; y: number } {
  let cx = 0, cy = 0;
  for (const u of us) { cx += u.x; cy += u.y; }
  cx /= us.length; cy /= us.length;
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (d < 20 || us.length < 3) return () => ({ x: 0, y: 0 });
  const nx = dx / d, ny = dy / d;
  return (u) => {
    const T = TYPES[u.type];
    const k = T.role === 'siege' ? 18 : T.range >= 20 || T.role === 'support' ? 11 : 0;
    return { x: nx * k, y: ny * k };
  };
}

export function applyCommand(w: World, c: Command, quiet = false): boolean {
  const say = (t: string, d?: number): void => { if (!quiet) worldSay(w, t, d); };
  const slot = c.slot, s = w.slots[slot];
  if (!s) return false;
  const editing = w.mode === 'sand' && w.phase === 'edit';
  switch (c.type) {
    case 'buy': {
      if (editing) return false;
      const T = TYPES[c.payload.unit];
      const freeUnit = cheat(w, slot, 'freeUnits');
      if (!freeUnit && s.gold < T.cost) { say('Need ' + T.cost + ' gold', 1.2); return false; }
      if (!cheat(w, slot, 'noPop') && committed(w, slot) >= w.cap) { say('Army cap reached (' + w.cap + ')', 1.5); return false; }
      const why = canTrain(w, slot, c.payload.unit);
      if (why) { say(T.name + ' ' + why, 1.5); return false; }
      const trainer = pickTrainer(w, slot, c.payload.unit, c.payload.building, c.payload.near);
      const queue = trainer ? trainer.queue : s.queue;
      if (queue.length >= (cheat(w, slot, 'noPop') ? 99 : trainer ? levelQueue(trainer.level) : 12)) { say('Queue is full', 1.2); return false; }
      if (!cheat(w, slot, 'noPop') && w.mode === 'conquest' && w.rules.population && popUsed(w, slot) + popOf(c.payload.unit) > popCap(w, slot)) { say('No room. Houses and settlements add population.', 1.5); return false; }
      if (w.mode === 'conquest' && !w.rules.town && T.cost >= ADVANCED_COST && !hasCity(w, slot)) { say('Needs a city', 1.5); return false; }
      if (!freeUnit) s.gold -= T.cost;
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
      if (!cheat(w, slot, 'gold')) s.gold -= RESEARCH_COST[lvl];
      s.tech[c.payload.tech] = lvl + 1;
      say(TECH_NAMES[c.payload.tech] + ' ' + (lvl + 1) + ' researched', 2);
      return true;
    }
    case 'ageUp': {
      // Grow the named settlement, else the best one. Same as upgrade, without picking a building.
      const named = c.payload?.id !== undefined ? s.settlements.find((b) => b.id === c.payload!.id && b.hp > 0) : undefined;
      const best = named ?? s.settlements.filter((b) => b.hp > 0 && b.buildT <= 0 && NEXT_TIER[b.tier]).sort((a, b) => (b.tier === 'town' ? 1 : 0) - (a.tier === 'town' ? 1 : 0))[0];
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
    case 'cheat': {
      if (slot !== 0 || !w.cheats.on) return false;
      return runCheat(w, c.payload, say);
    }
    case 'rename': {
      if (slot !== 0) return false;
      const r = w.regions[c.payload.region];
      const name = cleanName(c.payload.name);
      if (!r || !name || !settlementsIn(w, r.id).some((b) => b.team === slot)) return false;
      r.name = name;
      say('Renamed to ' + name, 1.5);
      return true;
    }
    case 'diplomacy': {
      if (slot !== 0 || w.mode !== 'conquest' || !w.rules.diplomacy) return false;
      const j = c.payload.slot, R = w.slots[j];
      if (!R || R.neutral || !R.alive || j === slot) return false;
      const name = TNAME[j];
      switch (c.payload.act) {
        case 'war': setTruce(w, slot, j, false); return true;
        case 'peace': {
          if (s.truce[j]) return false;
          const value = w.slots.map(() => 0);
          for (const u of w.units) if (u.hp > 0) value[u.team] += TYPES[u.type].cost;
          if (!truceAccepted(w, slot, j, value)) { say(name + ' refuses peace', 2); R.attitude[slot] -= 5; return false; }
          setTruce(w, slot, j, true);
          return true;
        }
        case 'ally': {
          if (s.pact[j]) return false;
          if (!allyAccepted(w, slot, j)) { say(name + ' is not ready for an alliance. Warm them up first.', 2.5); return false; }
          setPact(w, slot, j, true);
          return true;
        }
        case 'gift': {
          const g = Math.max(0, Math.min(c.payload.gold ?? 100, 1000));
          if (s.gold < g) { say('Need ' + g + ' gold', 1.2); return false; }
          s.gold -= g;
          R.attitude[slot] = Math.min(100, R.attitude[slot] + Math.min(25, g / 8));
          say(name + ' accepts ' + g + ' gold. Relations warm.', 2);
          return true;
        }
      }
      return false;
    }
    case 'choose': {
      if (slot !== 0) return false;
      return choose(w, c.payload.yes);
    }
    case 'cheats': {
      w.cheats = { ...c.payload };
      if (cheat(w, 0, 'gold')) w.slots[0].gold = Infinity; else if (!Number.isFinite(w.slots[0].gold)) w.slots[0].gold = 500;
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
      const firstHere = !settlementsIn(w, regionAt(w, c.payload.x, c.payload.y)).some((q) => !w.slots[q.team].neutral);
      const b = placeSettlement(w, slot, c.payload.x, c.payload.y, tier);
      if (firstHere && tier !== 'outpost') nameRegionFor(w, w.regions[b.region], s.race);
      if (tier !== 'outpost' && w.rules.civilians) seedResidents(w, b, 2);
      if (tier !== 'outpost') chronicle(w, (slot === 0 ? 'Founded ' : TNAME[slot] + ' founded ') + w.regions[b.region].name);
      say((tier === 'outpost' ? 'Outpost' : 'Village') + ' founded in ' + w.regions[b.region].name + '. Hold it 30s to claim.', 2.5);
      return true;
    }
    case 'upgrade': {
      if (w.mode !== 'conquest') return false;
      const b = s.settlements.find((x) => x.id === c.payload.id);
      const to = b ? NEXT_TIER[b.tier] : undefined;
      if (!b || b.hp <= 0 || !to || b.buildT > 0) { say('Pick a finished settlement of yours that can grow', 1.2); return false; }
      const growth = cheat(w, slot, 'growth');
      const why = growth ? null : canGrow(w, b);
      if (why) { say('Cannot grow to a ' + to + ': ' + why, 2.5); return false; }
      const T = TIERS[to], mat = w.rules.materials ? T.mat : 0;
      if (!growth && s.gold < T.gold) { say('Need ' + T.gold + ' gold', 1.2); return false; }
      if (!growth && s.mat < mat) { say('Need ' + mat + ' materials', 1.2); return false; }
      if (!growth) { s.gold -= T.gold; s.mat -= mat; }
      startUpgrade(b, to);
      if (growth) { b.buildT = 0; b.hp = b.max; }
      chronicle(w, (slot === 0 ? '' : TNAME[slot] + ': ') + w.regions[b.region].name + ' began growing into a ' + to);
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
      const why = castPower(w, slot, c.payload.power, c.payload.x, c.payload.y, c.payload.ids ?? []);
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
      const back = lineBack(us, x, y);
      us.forEach((u, i) => {
        const a = i * 2.4, r = Math.sqrt(i) * 3.4, b = back(u);
        u.order = { type: 'move', x: clamp(x + Math.cos(a) * r - b.x, 4, W - 4), y: clamp(y + Math.sin(a) * r - b.y, 4, H - 4) };
      });
      w.fx.push({ k: 'ping', x, y, t: 0.4 });
      return true;
    }
    case 'attack': {
      const us = ownUnits(w, slot, c.payload.ids);
      if (!us.length) return false;
      const tgt = resolveRef(w, c.payload.target);
      if (c.payload.target && (!tgt || tgt.team === slot)) return false;
      // Attacking someone at peace with you is a declaration of war. The UI asks first.
      if (tgt && allied(w, tgt.team, slot)) {
        if (!c.payload.declare || w.slots[tgt.team].ally === s.ally) return false;
        setTruce(w, slot, tgt.team, false);
        chronicle(w, (slot === 0 ? 'Attacked ' : TNAME[slot] + ' attacked ') + TNAME[tgt.team] + ' without warning');
      }
      const dest = c.payload.x !== undefined && c.payload.y !== undefined ? { x: clamp(c.payload.x, 4, mapW(w) - 4), y: clamp(c.payload.y, 4, mapH(w) - 4) } : null;
      const back = dest ? lineBack(us, dest.x, dest.y) : () => ({ x: 0, y: 0 });
      us.forEach((u, i) => {
        const o: import('./types.ts').Order = { type: 'attack', tgt };
        if (dest && !tgt) { const a = i * 2.4, r = Math.sqrt(i) * 3.4, b = back(u); o.x = clamp(dest.x + Math.cos(a) * r - b.x, 4, mapW(w) - 4); o.y = clamp(dest.y + Math.sin(a) * r - b.y, 4, mapH(w) - 4); }
        u.order = o;
      });
      if (dest && !tgt) w.fx.push({ k: 'mark', x: dest.x, y: dest.y, r: 6, t: 0.5, c: '#ff9a9a' });
      // The exact target flashes so the order visibly landed on it.
      if (tgt) w.fx.push({ k: 'mark', x: tgt.x, y: tgt.y, r: tgt.ent === 'unit' ? 6 : 10, t: 0.6, c: '#ff6b6b' });
      say(tgt ? 'Attacking' : dest ? 'Attack-moving' : 'Charge!', 1);
      return true;
    }
    case 'board': {
      const t = w.units.find((u) => u.id === c.payload.transport && u.team === slot && u.hp > 0);
      if (!t || !TYPES[t.type].capacity) return false;
      const us = ownUnits(w, slot, c.payload.ids).filter((u) => u !== t && !TYPES[u.type].capacity && !TYPES[u.type].naval && TYPES[u.type].role !== 'civ');
      if (!us.length) { say('Only ground units ride', 1.2); return false; }
      let inside = 0;
      for (const o of w.units) if (o.aboard === t.id && o.hp > 0) inside++;
      const room = (TYPES[t.type].capacity ?? 0) - inside;
      if (room <= 0) { say(TYPES[t.type].name + ' is full', 1.2); return false; }
      for (const u of us.slice(0, room)) u.order = { type: 'board', tgt: t };
      say(Math.min(room, us.length) + ' boarding the ' + TYPES[t.type].name.toLowerCase(), 1.2);
      return true;
    }
    case 'unload': {
      const ts = ownUnits(w, slot, c.payload.ids).filter((u) => TYPES[u.type].capacity);
      if (!ts.length) return false;
      for (const t of ts) t.order = { type: 'unload', x: clamp(c.payload.x, 4, mapW(w) - 4), y: clamp(c.payload.y, 4, mapH(w) - 4), stuck: 0, lx: t.x, ly: t.y };
      w.fx.push({ k: 'mark', x: c.payload.x, y: c.payload.y, r: 8, t: 0.5, c: '#dde2ec' });
      say('Unloading there', 1);
      return true;
    }
    case 'guard': {
      const us = ownUnits(w, slot, c.payload.ids);
      if (!us.length) return false;
      const W = mapW(w), H = mapH(w);
      const tgt = c.payload.target ? resolveRef(w, c.payload.target) : null;
      if (c.payload.target && (!tgt || !allied(w, tgt.team, slot))) return false;
      const x = tgt ? tgt.x : c.payload.x, y = tgt ? tgt.y : c.payload.y;
      us.forEach((u, i) => {
        const a = i * 2.4, r = 6 + Math.sqrt(i) * 3.4;
        const o: import('./types.ts').Order = { type: 'guard', x: clamp(x + Math.cos(a) * r, 4, W - 4), y: clamp(y + Math.sin(a) * r, 4, H - 4) };
        if (tgt) o.tgt = tgt;
        u.order = o;
      });
      w.fx.push({ k: 'mark', x, y, r: 6, t: 0.5, c: '#7dff7d' });
      say(tgt ? 'Guarding ' + (tgt.ent === 'unit' ? TYPES[tgt.type].name.toLowerCase() : tgt.ent === 'bld' ? BLD[tgt.type].name.toLowerCase() : 'the settlement') : 'Guarding', 1);
      return true;
    }
    case 'hold': {
      // Hold: stay here, fight what comes into reach, never wander off after it.
      const hs = ownUnits(w, slot, c.payload.ids);
      if (!hs.length) return false;
      let hx = 0, hy = 0;
      for (const u of hs) { u.order = { type: 'guard', x: u.x, y: u.y, hold: true }; hx += u.x; hy += u.y; }
      w.fx.push({ k: 'mark', x: hx / hs.length, y: hy / hs.length, r: 4, t: 0.5, c: '#dde2ec' });
      say('Holding position', 1);
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
      const freeB = cheat(w, slot, 'freeBuild');
      // Conquest: walls and towers cost materials, town buildings gold, the castle both.
      const matCost = !freeB && w.mode === 'conquest' && w.rules.materials && !cheat(w, slot, 'resources') ? (D0.town ? D0.mat ?? 0 : D0.cost) : 0;
      const goldCost = freeB ? 0 : !w.mode.startsWith('conq') ? D0.cost : D0.town ? D0.cost : 0;
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
      if (bld === 'wonder') { wonderBegun(w, nb); if (nb.buildT <= 0) wonderDone(w, nb); }
      return true;
    }
    case 'terrain': {
      if (editing) return false;
      const tx = clamp((c.payload.x / TILE) | 0, 0, mapW(w) / TILE - 1), ty = clamp((c.payload.y / TILE) | 0, 0, mapH(w) / TILE - 1);
      return startWork(w, slot, tx, ty, c.payload.kind);
    }
    case 'upgradeBld': {
      const b = w.blds.find((x) => x.id === c.payload.id && x.team === slot);
      if (!b) return false;
      const why = canUpgradeBld(w, slot, b);
      if (why) { say('Cannot upgrade: ' + why, 1.5); return false; }
      const targets = c.payload.connected && nextType(b.type) ? connectedSegments(w, b) : [b];
      let gold = 0, mat = 0;
      for (const t of targets) { const cst = upgradeCost(t); gold += cst.gold; mat += w.rules.materials && w.mode === 'conquest' ? cst.mat : 0; }
      if (!w.rules.materials || w.mode !== 'conquest') { gold += mat; mat = 0; }
      const free = cheat(w, slot, 'freeBuild');
      if (!free && s.gold < gold) { say('Need ' + gold + ' gold', 1.2); return false; }
      if (!free && s.mat < mat) { say('Need ' + mat + ' materials', 1.2); return false; }
      if (!free) { s.gold -= gold; s.mat -= mat; }
      const next = nextType(b.type);
      for (const t of targets) {
        if (next) {
          // The segment becomes the stronger kind in place, at the same fraction of health.
          const frac = t.hp / t.max, D = BLD[next];
          t.type = next; t.kind = D.kind;
          t.max = Math.round(D.hp * (1 + 0.25 * (w.slots[slot].tech.masonry ?? 0)));
          t.hp = Math.max(1, Math.round(t.max * frac));
        } else t.level++;
      }
      w.flowDirty = true;
      say(next ? targets.length + ' upgraded to ' + BLD[next].name.toLowerCase() : BLD[b.type].name + ' is level ' + b.level, 1.5);
      return true;
    }
    case 'unbuild': {
      // Undo of the last placement: full refund in what was paid, building gone.
      let n = 0;
      for (const id of c.payload.ids) {
        const b = w.blds.find((x) => x.id === id && x.team === slot);
        if (!b) continue;
        const D = BLD[b.type];
        removeBld(w, b);
        if (w.mode !== 'sand') { if (w.mode === 'conquest' && w.rules.materials && !D.town) s.mat += D.cost; else { s.gold += D.cost; if (w.mode === 'conquest' && w.rules.materials && D.mat) s.mat += D.mat; } }
        n++;
      }
      if (n) say('Undone', 0.8);
      return n > 0;
    }
    case 'sell': {
      const b = c.payload.id != null ? w.blds.find((x) => x.id === c.payload.id) : bldAtPx(w, c.payload.x, c.payload.y);
      if (!b && c.payload.id == null) {
        // No building: a road tile under the point comes up instead.
        const tx = (c.payload.x / TILE) | 0, ty = (c.payload.y / TILE) | 0;
        if (unroad(w, slot, tx, ty)) { say('Road removed', 0.6); return true; }
      }
      if (!b || b.team !== slot) { if (c.payload.id != null) say('Tap one of your buildings', 1); return false; }
      removeBld(w, b);
      // Half back, in what it cost: materials for walls and towers in a Realm, gold otherwise.
      const D = BLD[b.type];
      if (w.mode !== 'sand') { if (w.mode === 'conquest' && w.rules.materials && !D.town) s.mat += Math.floor(D.cost / 2); else s.gold += Math.floor(D.cost / 2); }
      say('Removed ' + D.name, 0.8);
      return true;
    }
    case 'setDefault': {
      const b = w.blds.find((x) => x.id === c.payload.building && x.team === slot);
      if (b) { s.prefer[c.payload.role] = b.id; say(BLD[b.type].name + ' is the default for ' + c.payload.role + ' units', 1.5); }
      else { delete s.prefer[c.payload.role]; say('Default cleared', 1); }
      return true;
    }
    case 'capture': {
      if (w.mode !== 'conquest') return false;
      let b: Settlement | null = null;
      for (const sl of w.slots) for (const x of sl.settlements) if (x.id === c.payload.id) b = x;
      if (!b || b.team === slot) return false;
      const why = canCapture(w, slot, b);
      if (why) { say('Cannot capture: ' + why, 1.5); return false; }
      const neutral = w.slots[b.team].neutral;
      const cost = neutral && b.tier === 'village' ? 200 : CAPTURE_COST;
      if (s.gold < cost) { say('Need ' + cost + ' gold', 1.2); return false; }
      s.gold -= cost;
      if (neutral && b.tier === 'village') { absorb(w, slot, b); say(w.regions[b.region].name + ' joins you with its buildings intact', 2.5); }
      else capture(w, slot, b);
      return true;
    }
    case 'place': {
      if (!editing) return false;
      let { x, y } = c.payload;
      if (count(w, slot) >= w.cap) { say('Cap is ' + w.cap + ' per team', 1.2); return false; }
      x = clamp(x, 4, mapW(w) - 4);
      y = clamp(y, 4, mapH(w) - 4);
      if (!passableFor(w, slot, x, y, TYPES[c.payload.unit].naval ? 'sea' : 'ground') && !TYPES[c.payload.unit].fly) { say(TYPES[c.payload.unit].naval ? 'Boats go on water' : 'Blocked ground', 1); return false; }
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
    if (passableFor(w, other, x, y, TYPES[u.type].naval ? 'sea' : 'ground') || TYPES[u.type].fly) w.units.push(mkUnit(w, other, u.type, x, y));
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
